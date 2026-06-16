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

    // 加载 HTML（使用 'load' 而非 'networkidle0'，因为 SVG 已内嵌为 Base64 Data URI，无需网络请求）
    await page.setContent(html, {
      waitUntil: 'load',
      timeout: 15000,
    })

    // 等待海报渲染完成标记
    await page.waitForSelector('.poster-ready', { timeout: 10000 })

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
