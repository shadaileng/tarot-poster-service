// 浏览器池单元测试
// Mock Puppeteer Browser/Page，验证池化逻辑

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { BrowserPool } from '../src/poster/browser-pool'
import type { Page, Browser } from 'puppeteer'

/** 创建 Mock Page 对象 */
function createMockPage(id: number): Page {
  let closed = false
  return {
    close: vi.fn().mockImplementation(async () => {
      closed = true
    }),
    isClosed: () => closed,
    _mockId: id,
  } as unknown as Page
}

/** 创建 Mock Browser 对象 */
function createMockBrowser(): Browser {
  let pageCounter = 0
  let closed = false
  return {
    newPage: vi.fn().mockImplementation(async () => {
      if (closed) throw new Error('Browser is closed')
      pageCounter++
      return createMockPage(pageCounter)
    }),
    close: vi.fn().mockImplementation(async () => {
      closed = true
    }),
    isConnected: vi.fn().mockReturnValue(true),
  } as unknown as Browser
}

describe('BrowserPool', () => {
  let browser: Browser

  beforeEach(() => {
    browser = createMockBrowser()
  })

  describe('acquire', () => {
    it('should create new page when under limit', async () => {
      const pool = new BrowserPool(browser, 3, 5000)
      const page = await pool.acquire()
      expect(page).toBeDefined()
      expect(browser.newPage).toHaveBeenCalledTimes(1)
      expect(pool.stats.active).toBe(1)
      expect(pool.stats.waiting).toBe(0)
    })

    it('should create multiple pages up to maxPages', async () => {
      const pool = new BrowserPool(browser, 2, 5000)
      const page1 = await pool.acquire()
      const page2 = await pool.acquire()

      expect(browser.newPage).toHaveBeenCalledTimes(2)
      expect(pool.stats.active).toBe(2)
      expect(pool.stats.waiting).toBe(0)

      // Cleanup
      await pool.release(page1)
      await pool.release(page2)
    })

    it('should throw when pool is shutting down', async () => {
      const pool = new BrowserPool(browser, 2, 5000)
      await pool.shutdown()

      await expect(pool.acquire()).rejects.toThrow('BrowserPool is shutting down')
    })

    it('should enqueue when pool is full', async () => {
      const pool = new BrowserPool(browser, 1, 5000)

      // Acquire the only slot
      const page1 = await pool.acquire()
      expect(pool.stats.active).toBe(1)

      // Try to acquire another - should queue
      const acquirePromise = pool.acquire()

      // Give time for the queue to register
      await new Promise((r) => setTimeout(r, 50))

      expect(pool.stats.active).toBe(1)
      expect(pool.stats.waiting).toBe(1)

      // Release the first page - should serve the queued request
      await pool.release(page1)

      const page2 = await acquirePromise
      expect(page2).toBeDefined()
      expect(pool.stats.waiting).toBe(0)

      await pool.release(page2)
    })

    it('should reject after acquire timeout', async () => {
      const pool = new BrowserPool(browser, 1, 100) // 100ms timeout

      // Acquire the only slot
      const page = await pool.acquire()

      // Try to acquire another - should timeout
      await expect(pool.acquire()).rejects.toThrow('BrowserPool: acquire timeout')

      await pool.release(page)
    })
  })

  describe('release', () => {
    it('should close page and free slot', async () => {
      const pool = new BrowserPool(browser, 2, 5000)
      const page = await pool.acquire()

      const closeSpy = page.close as ReturnType<typeof vi.fn>
      await pool.release(page)

      expect(closeSpy).toHaveBeenCalled()
      expect(pool.stats.active).toBe(0)
    })

    it('should serve queued request after release', async () => {
      const pool = new BrowserPool(browser, 1, 5000)
      const page1 = await pool.acquire()

      // Queue a request
      let resolvedPage: Page | null = null
      const waitPromise = pool.acquire().then((p) => { resolvedPage = p; return p })

      await new Promise((r) => setTimeout(r, 50))
      expect(pool.stats.waiting).toBe(1)

      await pool.release(page1)

      const page2 = await waitPromise
      expect(page2).toBeDefined()
      expect(resolvedPage).not.toBeNull()
      expect(pool.stats.waiting).toBe(0)
      expect(pool.stats.active).toBe(1)

      await pool.release(page2)
    })

    it('should handle close failure gracefully', async () => {
      const pool = new BrowserPool(browser, 2, 5000)
      const page = await pool.acquire()

      // Make close throw
      ;(page.close as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Close failed'))

      // Should not throw
      await expect(pool.release(page)).resolves.toBeUndefined()
      expect(pool.stats.active).toBe(0)
    })
  })

  describe('shutdown', () => {
    it('should set isShuttingDown flag', async () => {
      const pool = new BrowserPool(browser, 2, 5000)
      await pool.shutdown()
      await expect(pool.acquire()).rejects.toThrow('BrowserPool is shutting down')
    })

    it('should reject all waiting entries', async () => {
      const pool = new BrowserPool(browser, 1, 10000)
      const page = await pool.acquire()

      const waitPromise1 = pool.acquire()
      const waitPromise2 = pool.acquire()

      await new Promise((r) => setTimeout(r, 50))
      expect(pool.stats.waiting).toBe(2)

      await pool.shutdown()

      await expect(waitPromise1).rejects.toThrow('BrowserPool is shutting down')
      await expect(waitPromise2).rejects.toThrow('BrowserPool is shutting down')
      expect(pool.stats.waiting).toBe(0)
    })

    it('should close all active pages', async () => {
      const pool = new BrowserPool(browser, 3, 5000)
      const page1 = await pool.acquire()
      const page2 = await pool.acquire()

      await pool.shutdown()

      expect(page1.close).toHaveBeenCalled()
      expect(page2.close).toHaveBeenCalled()
      expect(pool.stats.active).toBe(0)
    })
  })

  describe('stats', () => {
    it('should return initial state correctly', () => {
      const pool = new BrowserPool(browser, 4, 5000)
      const stats = pool.stats
      expect(stats.available).toBe(0)
      expect(stats.active).toBe(0)
      expect(stats.waiting).toBe(0)
      expect(stats.maxPages).toBe(4)
    })

    it('should reflect current pool state', async () => {
      const pool = new BrowserPool(browser, 2, 5000)
      const page = await pool.acquire()

      expect(pool.stats.active).toBe(1)
      expect(pool.stats.maxPages).toBe(2)

      await pool.release(page)
      expect(pool.stats.active).toBe(0)
    })

    it('should track waiting count', async () => {
      const pool = new BrowserPool(browser, 1, 10000)
      await pool.acquire()

      // Should queue
      pool.acquire().catch(() => {})
      await new Promise((r) => setTimeout(r, 50))

      expect(pool.stats.waiting).toBe(1)

      await pool.shutdown()
    })
  })
})
