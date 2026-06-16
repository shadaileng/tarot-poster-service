// Puppeteer 截图逻辑（含浏览器连接池）
// 复用浏览器实例，避免每次请求都 launch + close

import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import puppeteer, { type Browser, type ConsoleMessage } from 'puppeteer'
import { config } from '../config.js'

// ========== 浏览器连接池 + 自动重连 ==========
let browserPromise: Promise<Browser> | null = null
let healthCheckTimer: ReturnType<typeof setInterval> | null = null
const HEALTH_CHECK_INTERVAL_MS = 30_000

/** 启动周期性浏览器健康检查（不阻止进程退出） */
function startHealthCheck(): void {
  if (healthCheckTimer) return
  healthCheckTimer = setInterval(async () => {
    if (!browserPromise) return
    try {
      const browser = await browserPromise
      if (!browser.isConnected()) {
        console.warn('[Puppeteer] Health check: browser disconnected, resetting...')
        browserPromise = null
      }
    } catch {
      console.warn('[Puppeteer] Health check: browser promise rejected, resetting...')
      browserPromise = null
    }
  }, HEALTH_CHECK_INTERVAL_MS)
  healthCheckTimer.unref()
}

/** 停止健康检查 */
function stopHealthCheck(): void {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer)
    healthCheckTimer = null
  }
}

async function getBrowser(): Promise<Browser> {
  // ① 检查现有浏览器是否仍然连接
  if (browserPromise) {
    try {
      const browser = await browserPromise
      if (browser.isConnected()) {
        return browser
      }
      console.warn('[Puppeteer] Browser disconnected, re-launching...')
      browserPromise = null
    } catch (e) {
      console.warn('[Puppeteer] Existing browser promise rejected, re-launching:', (e as Error).message)
      browserPromise = null
    }
  }

  // ② 启动新浏览器
  console.log('[Puppeteer] Launching browser...')
  browserPromise = puppeteer.launch({
    headless: true,
    executablePath: config.puppeteer.executablePath,
    args: config.puppeteer.args,
  })

  // ③ 注册 disconnected 事件监听（主动感知崩溃）
  const browser = await browserPromise
  browser.on('disconnected', () => {
    console.warn('[Puppeteer] Browser disconnected event fired, resetting...')
    browserPromise = null
    stopHealthCheck()
  })

  // ④ 启动健康检查（双保险）
  startHealthCheck()

  return browser
}

// 优雅关闭浏览器
export async function closeBrowser(): Promise<void> {
  stopHealthCheck()
  if (browserPromise) {
    try {
      const browser = await browserPromise
      await browser.close()
      console.log('[Puppeteer] Browser closed')
    } catch (e) {
      console.error('[Puppeteer] Error closing browser:', e)
    }
    browserPromise = null
  }
}

// 监听进程退出
process.on('SIGTERM', () => { void closeBrowser() })
process.on('SIGINT', () => { void closeBrowser() })

// ========== 截图渲染 ==========
export async function renderPoster(html: string): Promise<Buffer> {
  const browser = await getBrowser()
  const page = await browser.newPage()

  // ========== 诊断日志收集 ==========
  const consoleLogs: { type: string; text: string }[] = []
  const pageErrors: string[] = []

  const onConsole = (msg: ConsoleMessage) => {
    consoleLogs.push({ type: msg.type(), text: msg.text() })
  }
  const onPageError = (err: Error) => {
    pageErrors.push(`${err.name}: ${err.message}`)
  }

  page.on('console', onConsole)
  page.on('pageerror', onPageError)

  try {
    // 设置视口（2x 高清）
    await page.setViewport({
      width: config.poster.width,
      height: config.poster.height,
      deviceScaleFactor: 2,
    })

    // 加载 HTML（使用 'domcontentloaded'，后续有独立的资源就绪检查）
    await page.setContent(html, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })

    // ========== 增强资源就绪检查 ==========
    // ① 等待所有 <img> complete 且 naturalWidth > 0
    // ② 执行 img.decode() 强制 GPU 纹理上传
    // ③ 等待 document.fonts.ready（字体渲染完成）
    await page.evaluate(async () => {
      const images = Array.from(document.querySelectorAll('img'))

      // ① 等待所有图片加载完成
      await Promise.all(
        images.map((img) => {
          if (img.complete && img.naturalWidth > 0) return Promise.resolve()
          return new Promise<void>((resolve) => {
            const timeout = setTimeout(() => resolve(), 8000)
            const cleanup = () => { clearTimeout(timeout); resolve() }
            img.addEventListener('load', cleanup, { once: true })
            img.addEventListener('error', cleanup, { once: true })
          })
        })
      )

      // ② 执行 img.decode() 强制 GPU 纹理上传
      await Promise.all(
        images.map((img) => {
          if ((img as HTMLImageElement & { decode?: () => Promise<void> }).decode) {
            return (img as HTMLImageElement & { decode?: () => Promise<void> }).decode!().catch(() => {})
          }
          return Promise.resolve()
        })
      )

      // ③ 等待字体就绪
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready
      }
    })

    // ④ 额外等待 100ms 让浏览器完成合成管线
    await new Promise((resolve) => setTimeout(resolve, 100))

    // ⑤ 最终等待 .poster-ready 选择器（确保 CSS 动画/过渡完成）
    await page.waitForSelector('.poster-ready', { timeout: 10000 })
    // ========== 资源就绪检查结束 ==========

    // 截图
    const screenshot = await page.screenshot({
      type: 'png',
      fullPage: true,
    })

    return Buffer.from(screenshot)
  } catch (error) {
    // ========== 错误诊断抓取 ==========
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error(`[Puppeteer] renderPoster failed: ${errMsg}`)

    let diagnosticHtml: string | null = null
    let failureScreenshotPath: string | null = null
    let failureScreenshotSize: number | null = null

    // ① 捕获 page.content() 作为诊断 HTML
    try {
      diagnosticHtml = await page.content()
    } catch (e) {
      console.error('[Puppeteer] Diagnostic - Failed to capture page HTML:', (e as Error).message)
    }

    // ② 尝试 page.screenshot() 获取失败时页面快照，保存到临时文件
    try {
      const failureScreenshot = await page.screenshot({
        type: 'png',
        fullPage: true,
      })
      const tmpDir = os.tmpdir()
      const filename = `tarot-poster-error-${Date.now()}.png`
      failureScreenshotPath = path.join(tmpDir, filename)
      await fs.writeFile(failureScreenshotPath, failureScreenshot)
      failureScreenshotSize = failureScreenshot.length
    } catch (e) {
      console.error('[Puppeteer] Diagnostic - Failed to capture failure screenshot:', (e as Error).message)
    }

    // ③ 输出结构化诊断日志
    console.error('[Puppeteer] Render diagnostics:', JSON.stringify({
      error: errMsg,
      htmlPreview: diagnosticHtml ? diagnosticHtml.slice(0, 2000) : null,
      failureScreenshot: failureScreenshotPath
        ? { path: failureScreenshotPath, size: failureScreenshotSize }
        : null,
      consoleLogs: consoleLogs.length > 0 ? consoleLogs.slice(-50) : [],
      pageErrors: pageErrors.length > 0 ? pageErrors : [],
      timestamp: new Date().toISOString(),
    }))

    // 重新抛出原始错误
    throw error
  } finally {
    // 清理监听器防止内存泄漏
    page.off('console', onConsole)
    page.off('pageerror', onPageError)

    try {
      await page.close()
    } catch (e) {
      console.warn('[Puppeteer] Error closing page (may already be closed):', (e as Error).message)
    }
  }
}
