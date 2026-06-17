// API 端到端测试 — supertest

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import supertest from 'supertest'

// 必须在 import app 之前 mock puppeteer 和 browser-pool
vi.mock('puppeteer', () => ({
  default: {
    launch: vi.fn().mockRejectedValue(new Error('Puppeteer not available in test')),
  },
  launch: vi.fn().mockRejectedValue(new Error('Puppeteer not available in test')),
}))

vi.mock('../src/poster/browser-pool', () => ({
  getBrowserPool: vi.fn().mockResolvedValue(null),
  closeBrowserPool: vi.fn().mockResolvedValue(undefined),
  getPoolStats: vi.fn().mockResolvedValue({
    available: 0,
    active: 0,
    waiting: 0,
    maxPages: 4,
  }),
  BrowserPool: vi.fn(),
}))

// Mock renderPoster to return fake PNG
vi.mock('../src/poster/render', async () => {
  const fakeBuffer = Buffer.from('fake-png-data')
  const fakeTimings = {
    setContentMs: 10,
    resourceMs: 200,
    composeMs: 100,
    screenshotMs: 150,
    totalMs: 500,
  }
  return {
    renderPoster: vi.fn().mockResolvedValue({ buffer: fakeBuffer, timings: fakeTimings }),
    closeBrowser: vi.fn().mockResolvedValue(undefined),
  }
})

import app from '../src/index'
import { posterCache } from '../src/cache'
import { metrics } from '../src/monitor/metrics'

describe('API', () => {
  beforeAll(() => {
    metrics.reset()
  })

  afterAll(() => {
    metrics.reset()
  })

  describe('GET /', () => {
    it('should return 200 with service info', async () => {
      const res = await supertest(app).get('/')
      expect(res.status).toBe(200)
      expect(res.body.service).toBe('tarot-poster-service')
      expect(res.body.status).toBe('running')
    })

    it('should list endpoints', async () => {
      const res = await supertest(app).get('/')
      expect(res.body.endpoints).toBeDefined()
      expect(res.body.endpoints.health).toBe('GET /health')
      expect(res.body.endpoints.poster).toBe('POST /poster')
      expect(res.body.endpoints.metrics).toBe('GET /metrics')
    })
  })

  describe('GET /health', () => {
    it('should return 200 with status ok', async () => {
      const res = await supertest(app).get('/health')
      expect(res.status).toBe(200)
      expect(res.body.status).toBe('ok')
    })

    it('should include cache stats', async () => {
      const res = await supertest(app).get('/health')
      expect(res.body.cache).toBeDefined()
      expect(res.body.cache.size).toBeDefined()
      expect(res.body.cache.maxSize).toBeDefined()
    })

    it('should include pool stats', async () => {
      const res = await supertest(app).get('/health')
      expect(res.body.pool).toBeDefined()
      expect(res.body.pool.maxPages).toBe(4)
    })

    it('should include metrics data', async () => {
      const res = await supertest(app).get('/health')
      expect(res.body.metrics).toBeDefined()
      expect(res.body.metrics.totalRequests).toBeDefined()
      expect(res.body.metrics.errors).toBeDefined()
    })
  })

  describe('GET /metrics', () => {
    it('should return text/plain Prometheus format', async () => {
      const res = await supertest(app).get('/metrics')
      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toContain('text/plain')
    })

    it('should include HELP comments', async () => {
      const res = await supertest(app).get('/metrics')
      expect(res.text).toContain('# HELP poster_requests_total')
      expect(res.text).toContain('# TYPE poster_requests_total counter')
    })
  })

  describe('POST /poster', () => {
    const validBody = {
      cards: [
        {
          name: '愚者',
          image: '/cards/major-00.svg',
          position: '现状',
          orientation: 'upright' as const,
          meaning: '新的开始，冒险精神',
          keywords: ['开始', '冒险', '天真', '自由'],
          type: 'major',
          number: 0,
        },
        {
          name: '女祭司',
          image: '/cards/major-02.svg',
          position: '未来',
          orientation: 'reversed' as const,
          meaning: '直觉，内在智慧',
          keywords: ['直觉', '神秘', '内在'],
          type: 'major',
          number: 2,
        },
      ],
      question: '我的未来会怎样？',
      spreadName: '三牌阵',
      interpretation: '逐张牌解读...\n\n✨ 综合解读\n这是一段关于成长与探索的旅程...',
      date: '2026-06-17',
    }

    beforeEach(() => {
      // 清除缓存，确保每个测试独立
      posterCache['cache'].clear()
      // 注意：LRUCache 没有暴露 clear 方法，我们重置指标
      metrics.reset()
    })

    it('should reject request with empty cards (400)', async () => {
      const res = await supertest(app)
        .post('/poster')
        .send({ ...validBody, cards: [] })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('cards')
    })

    it('should reject request with missing cards (400)', async () => {
      const res = await supertest(app)
        .post('/poster')
        .send({ ...validBody, cards: undefined })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('cards')
    })

    it('should return 200 with image/png on valid request', async () => {
      const res = await supertest(app)
        .post('/poster')
        .send(validBody)

      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toBe('image/png')
    })

    it('should set X-Cache MISS on first request', async () => {
      const res = await supertest(app)
        .post('/poster')
        .send(validBody)

      expect(res.headers['x-cache']).toBe('MISS')
    })

    it('should set X-Cache HIT on repeated request', async () => {
      // First request (cache miss, but need to manually cache since mock returns same buffer)
      const res1 = await supertest(app)
        .post('/poster')
        .send(validBody)
      expect(res1.status).toBe(200)

      // Second request should hit cache
      const res2 = await supertest(app)
        .post('/poster')
        .send(validBody)
      expect(res2.status).toBe(200)
      expect(res2.headers['x-cache']).toBe('HIT')
    })

    it('should set X-Render-* response headers on MISS', async () => {
      // Need fresh cache
      const uniqueBody = { ...validBody, question: 'unique-question-' + Date.now() }
      const res = await supertest(app)
        .post('/poster')
        .send(uniqueBody)

      expect(res.headers['x-render-total-ms']).toBeDefined()
      expect(res.headers['x-render-template-ms']).toBeDefined()
      expect(res.headers['x-render-resource-ms']).toBeDefined()
      expect(res.headers['x-render-screenshot-ms']).toBeDefined()
    })

    it('should set Cache-Control header', async () => {
      const res = await supertest(app)
        .post('/poster')
        .send(validBody)

      expect(res.headers['cache-control']).toBe('public, max-age=3600')
    })

    it('should handle different templates', async () => {
      const res = await supertest(app)
        .post('/poster')
        .send({ ...validBody, template: 'minimal', question: 'minimal-test-' + Date.now() })

      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toBe('image/png')
    })

    it('should handle light theme', async () => {
      const res = await supertest(app)
        .post('/poster')
        .send({ ...validBody, theme: 'light', question: 'light-test-' + Date.now() })

      expect(res.status).toBe(200)
    })
  })

  describe('auth middleware', () => {
    it('should skip auth when API_KEY not configured', async () => {
      // By default API_KEY is not set in test env
      const res = await supertest(app).get('/health')
      expect(res.status).toBe(200)
    })
  })

  describe('CORS middleware', () => {
    it('should set Access-Control-Allow-Origin header', async () => {
      const res = await supertest(app).get('/')
      expect(res.headers['access-control-allow-origin']).toBeDefined()
    })

    it('should set Access-Control-Allow-Methods header', async () => {
      const res = await supertest(app).get('/')
      expect(res.headers['access-control-allow-methods']).toContain('GET')
      expect(res.headers['access-control-allow-methods']).toContain('POST')
      expect(res.headers['access-control-allow-methods']).toContain('OPTIONS')
    })

    it('should respond 204 to OPTIONS request', async () => {
      const res = await supertest(app).options('/')
      expect(res.status).toBe(204)
    })
  })
})
