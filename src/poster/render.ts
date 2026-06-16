// Puppeteer 截图逻辑（含浏览器连接池）
// 复用浏览器实例，避免每次请求都 launch + close

import puppeteer, { type Browser } from 'puppeteer'
import { config } from '../config.js'

// ========== 浏览器连接池 ==========
let browserPromise: Promise<Browser> | null = null

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    console.log('[Puppeteer] Launching browser...')
    browserPromise = puppeteer.launch({
      headless: true,
      executablePath: config.puppeteer.executablePath,
      args: config.puppeteer.args,
    })
  }
  return browserPromise
}

// 优雅关闭浏览器
export async function closeBrowser(): Promise<void> {
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
  } finally {
    await page.close()
  }
}
