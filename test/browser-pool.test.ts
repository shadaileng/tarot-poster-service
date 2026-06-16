// 浏览器 Page 池化测试

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import puppeteer, { type Browser } from 'puppeteer'
import { BrowserPool } from '../src/poster/browser-pool'

let browser: Browser

beforeAll(async () => {
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })
})

afterAll(async () => {
  await browser.close()
})

describe('BrowserPool', () => {
  it('should acquire and release a page', async () => {
    const pool = new BrowserPool(browser, 2, 5000)

    const page = await pool.acquire()
    expect(page).toBeDefined()
    expect(pool.stats.active).toBe(1)
    expect(pool.stats.available).toBe(0)

    await pool.release(page)
    expect(pool.stats.active).toBe(0)
    expect(pool.stats.available).toBe(1)

    await pool.shutdown()
  })

  it('should reuse available pages', async () => {
    const pool = new BrowserPool(browser, 2, 5000)

    const page1 = await pool.acquire()
    await pool.release(page1)

    const page2 = await pool.acquire()
    // 应该复用 page1
    expect(page2).toBe(page1)

    await pool.release(page2)
    await pool.shutdown()
  })

  it('should queue when pool is full', async () => {
    const pool = new BrowserPool(browser, 1, 3000)

    const page1 = await pool.acquire()
    expect(pool.stats.active).toBe(1)

    // 第二个 acquire 应该排队
    const acquirePromise = pool.acquire()

    // 短暂等待确保进入排队状态
    await new Promise((r) => setTimeout(r, 100))
    expect(pool.stats.waiting).toBe(1)

    // 释放 page1，排队应该被唤醒
    await pool.release(page1)
    const page2 = await acquirePromise

    expect(page2).toBe(page1) // 复用
    expect(pool.stats.waiting).toBe(0)

    await pool.release(page2)
    await pool.shutdown()
  })

  it('should timeout when waiting too long', async () => {
    const pool = new BrowserPool(browser, 1, 500) // 500ms 超时

    const page1 = await pool.acquire()

    // 不释放 page1，第二个 acquire 应该超时
    await expect(pool.acquire()).rejects.toThrow('acquire timeout')

    await pool.release(page1)
    await pool.shutdown()
  })

  it('should handle shutdown gracefully', async () => {
    const pool = new BrowserPool(browser, 2, 5000)

    const page = await pool.acquire()
    await pool.release(page)

    expect(pool.stats.available).toBe(1)

    await pool.shutdown()
    expect(pool.stats.available).toBe(0)
    expect(pool.stats.active).toBe(0)
  })

  it('should reject waiters on shutdown', async () => {
    const pool = new BrowserPool(browser, 1, 10000)

    const page = await pool.acquire()

    // 排队请求
    const acquirePromise = pool.acquire()
    await new Promise((r) => setTimeout(r, 100))
    expect(pool.stats.waiting).toBe(1)

    // shutdown 应该拒绝等待者
    const shutdownPromise = pool.shutdown()
    await expect(acquirePromise).rejects.toThrow('shutting down')
    await shutdownPromise

    // 清理已获取的 page
    try { await page.close() } catch { /* 可能已被 shutdown 关闭 */ }
  })

  it('should handle maxPages correctly', async () => {
    const pool = new BrowserPool(browser, 3, 5000)
    expect(pool.stats.maxPages).toBe(3)

    const pages: puppeteer.Page[] = []
    for (let i = 0; i < 3; i++) {
      pages.push(await pool.acquire())
    }
    expect(pool.stats.active).toBe(3)
    expect(pool.stats.available).toBe(0)

    for (const p of pages) {
      await pool.release(p)
    }
    expect(pool.stats.available).toBe(3)
    expect(pool.stats.active).toBe(0)

    await pool.shutdown()
  })
})
