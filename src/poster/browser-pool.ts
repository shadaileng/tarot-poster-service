// 浏览器 Page 池化
// 预创建/复用 Page，控制并发数，避免每次请求都 newPage + close

import { type Browser, type Page } from 'puppeteer'
import { config } from '../config.js'

export interface PoolStats {
  available: number
  active: number
  waiting: number
  maxPages: number
}

interface QueueEntry {
  resolve: (page: Page) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export class BrowserPool {
  private browser: Browser
  private maxPages: number
  private acquireTimeoutMs: number

  private availablePages: Page[] = []
  private activePages: Set<Page> = new Set()
  private waitQueue: QueueEntry[] = []

  private isShuttingDown = false

  constructor(browser: Browser, maxPages: number, acquireTimeoutMs: number) {
    this.browser = browser
    this.maxPages = maxPages
    this.acquireTimeoutMs = acquireTimeoutMs
  }

  /** 获取一个可用的 Page，池满时排队等待 */
  async acquire(): Promise<Page> {
    if (this.isShuttingDown) {
      throw new Error('BrowserPool is shutting down')
    }

    // 有空闲 Page，直接返回
    if (this.availablePages.length > 0) {
      const page = this.availablePages.pop()!
      this.activePages.add(page)
      return page
    }

    // 还有配额，创建新 Page
    if (this.activePages.size < this.maxPages) {
      const page = await this.browser.newPage()
      this.activePages.add(page)
      return page
    }

    // 池满，排队等待
    return new Promise<Page>((resolve, reject) => {
      const timer = setTimeout(() => {
        // 超时：从队列中移除
        const idx = this.waitQueue.findIndex((e) => e.timer === timer)
        if (idx !== -1) {
          this.waitQueue.splice(idx, 1)
        }
        reject(
          new Error(
            `BrowserPool: acquire timeout after ${this.acquireTimeoutMs}ms (waiting: ${this.waitQueue.length})`
          )
        )
      }, this.acquireTimeoutMs)

      this.waitQueue.push({ resolve, reject, timer })
    })
  }

  /** 归还 Page 到池中，清理状态 */
  async release(page: Page): Promise<void> {
    this.activePages.delete(page)

    // 检查 Page 是否仍然有效
    try {
      // 检查 Page 是否已断开（isClosed 可能在旧版不存在，用 try-catch 兜底）
      if (page.isClosed && page.isClosed()) {
        // Page 已关闭，丢弃，不归还
        this.processQueue()
        return
      }
    } catch {
      // 无法判断，尝试清理后丢弃
      this.processQueue()
      return
    }

    try {
      // 清理 Page 状态：导航到空白页，释放 DOM 和内存
      await page.goto('about:blank', { waitUntil: 'domcontentloaded', timeout: 5000 })
    } catch {
      // 导航失败，关闭这个 Page，创建新 Page 补充
      try {
        await page.close()
      } catch {
        // 静默忽略关闭失败
      }
      this.processQueue()
      return
    }

    // 清理 cookies / localStorage / sessionStorage（可选）
    try {
      const client = await page.createCDPSession()
      await client.send('Network.clearBrowserCookies')
      await client.send('Network.clearBrowserCache')
      await client.detach()
    } catch {
      // CDP 清理失败不影响后续使用
    }

    // 清理事件监听器（避免累积）
    page.removeAllListeners()

    // 归还到可用池
    this.availablePages.push(page)

    // 通知等待队列
    this.processQueue()
  }

  /** 关闭所有 Page */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true

    // 拒绝所有等待者
    for (const entry of this.waitQueue) {
      clearTimeout(entry.timer)
      entry.reject(new Error('BrowserPool is shutting down'))
    }
    this.waitQueue = []

    // 关闭所有空闲 Page
    const allPages = [...this.availablePages, ...this.activePages]
    this.availablePages = []
    this.activePages.clear()

    await Promise.allSettled(
      allPages.map((page) =>
        page.close().catch((e) => {
          console.warn('[BrowserPool] Error closing page during shutdown:', (e as Error).message)
        })
      )
    )

    console.log(`[BrowserPool] Shutdown complete: ${allPages.length} pages closed`)
  }

  /** 获取池状态 */
  get stats(): PoolStats {
    return {
      available: this.availablePages.length,
      active: this.activePages.size,
      waiting: this.waitQueue.length,
      maxPages: this.maxPages,
    }
  }

  /** 处理等待队列：有空闲配额时分发 Page */
  private processQueue(): void {
    while (this.waitQueue.length > 0 && this.activePages.size < this.maxPages) {
      const entry = this.waitQueue.shift()!
      clearTimeout(entry.timer)

      // 优先从空闲池取，否则创建新 Page
      if (this.availablePages.length > 0) {
        const page = this.availablePages.pop()!
        this.activePages.add(page)
        entry.resolve(page)
      } else {
        // 理论上走不到这里，但作为安全分支
        this.browser
          .newPage()
          .then((page) => {
            this.activePages.add(page)
            entry.resolve(page)
          })
          .catch((e) => {
            entry.reject(e)
          })
      }
    }
  }
}

// ========== 全局单例 ==========
let poolPromise: Promise<BrowserPool> | null = null

export async function getBrowserPool(browser: Browser): Promise<BrowserPool> {
  if (poolPromise) {
    const pool = await poolPromise
    if (!pool.stats.maxPages) {
      // pool 已 shutdown，重新创建
      poolPromise = null
    } else {
      return pool
    }
  }

  poolPromise = Promise.resolve(
    new BrowserPool(browser, config.pool.maxPages, config.pool.acquireTimeoutMs)
  )
  return poolPromise
}

export async function closeBrowserPool(): Promise<void> {
  if (poolPromise) {
    try {
      const pool = await poolPromise
      await pool.shutdown()
    } catch (e) {
      console.error('[BrowserPool] Error shutting down pool:', e)
    }
    poolPromise = null
  }
}

/** 获取当前池状态（无需 browser 实例，未初始化时返回 null） */
export async function getPoolStats(): Promise<PoolStats | null> {
  if (!poolPromise) return null
  try {
    const pool = await poolPromise
    return pool.stats
  } catch {
    return null
  }
}
