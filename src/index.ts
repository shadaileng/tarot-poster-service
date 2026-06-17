// Express 服务入口
// 提供海报生成 API、健康检查、根路径（HF Spaces 兼容）

import 'dotenv/config'
import path from 'path'
import { fileURLToPath } from 'url'
import express from 'express'
import { config } from './config.js'
import { corsMiddleware } from './middleware/cors.js'
import { authMiddleware } from './middleware/auth.js'
import { buildPosterHTML } from './poster/template.js'
import { renderPoster } from './poster/render.js'
import { getPoolStats } from './poster/browser-pool.js'
import { posterCache } from './cache/index.js'
import { getTemplate } from './poster/templates/index.js'
import { metrics } from './monitor/index.js'
import { getLogger } from './logger.js'
import type { PosterData } from './poster/types.js'

const log = getLogger('API')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app: express.Express = express()
app.use(express.json({ limit: '1mb' }))
app.use(corsMiddleware)

// 静态文件服务：本地卡牌 SVG 图片
app.use('/cards', express.static(path.join(__dirname, '../assets/cards')))

// ========== 根路径（HF Spaces 兼容） ==========
app.get('/', (_req, res) => {
  res.json({
    service: 'tarot-poster-service',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: 'GET /health',
      poster: 'POST /poster',
      metrics: 'GET /metrics',
    },
  })
})

// ========== 健康检查 ==========
app.get('/health', async (_req, res) => {
  const poolStats = await getPoolStats()
  const snap = metrics.getSnapshot()
  res.json({
    status: 'ok',
    cache: {
      size: posterCache.size,
      maxSize: posterCache.maxSize,
      hitRate: snap.cacheHitRate,
    },
    pool: poolStats ?? { available: 0, active: 0, waiting: 0, maxPages: config.pool.maxPages },
    metrics: {
      totalRequests: snap.totalRequests,
      errors: snap.errorCount,
      avgTotalMs: Math.round(snap.avgTotalMs),
      renderP50: snap.totalP50,
      renderP95: snap.totalP95,
      renderP99: snap.totalP99,
    },
  })
})

// ========== Prometheus 指标端点 ==========
app.get('/metrics', (_req, res) => {
  res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  res.send(metrics.toPrometheus())
})

// ========== 海报生成 API ==========
app.post('/poster', authMiddleware, async (req, res) => {
  const requestStart = Date.now()
  const posterData = req.body as PosterData
  const template = getTemplate(posterData.template)

  try {
    // 参数校验
    if (!posterData.cards || !Array.isArray(posterData.cards) || posterData.cards.length === 0) {
      res.status(400).json({ error: 'Invalid request: cards array is required' })
      return
    }

    // 检查缓存
    const cacheKey = posterCache.generateKey(posterData)
    const cached = posterCache.get(cacheKey)
    if (cached) {
      res.set('Content-Type', 'image/png')
      res.set('X-Cache', 'HIT')
      res.set('Cache-Control', 'public, max-age=3600')
      res.send(cached)

      // 记录缓存命中指标
      metrics.recordRender({
        templateMs: 0,
        resourceMs: 0,
        screenshotMs: 0,
        totalMs: Date.now() - requestStart,
        timestamp: requestStart,
        template: template.name,
        cacheHit: true,
      })
      return
    }

    // 阶段 1：模板生成
    const templateStart = Date.now()
    const html = buildPosterHTML(posterData)
    const templateMs = Date.now() - templateStart

    // 阶段 2：截图（含资源等待、合成、截图）
    const { buffer: imageBuffer, timings } = await renderPoster(html, template.width)

    // 缓存
    posterCache.set(cacheKey, imageBuffer)

    const totalMs = Date.now() - requestStart

    // 记录精确渲染指标
    metrics.recordRender({
      templateMs,
      resourceMs: timings.resourceMs,
      screenshotMs: timings.screenshotMs,
      totalMs,
      timestamp: requestStart,
      template: template.name,
      cacheHit: false,
    })

    res.set('Content-Type', 'image/png')
    res.set('X-Cache', 'MISS')
    res.set('X-Render-Template-Ms', String(templateMs))
    res.set('X-Render-Resource-Ms', String(timings.resourceMs))
    res.set('X-Render-Screenshot-Ms', String(timings.screenshotMs))
    res.set('X-Render-Total-Ms', String(totalMs))
    res.set('Cache-Control', 'public, max-age=3600')
    res.send(imageBuffer)
  } catch (error) {
    metrics.recordError()
    log.error({ err: error }, 'Poster generation failed')
    res.status(500).json({ error: 'Poster generation failed' })
  }
})

// ========== 启动服务 ==========
app.listen(config.port, '0.0.0.0', () => {
  log.info({ port: config.port }, 'Tarot Poster Service running')
  log.info({ environment: config.nodeEnv }, 'Environment')
  log.info({ authEnabled: !!config.apiKey }, 'Auth status')
  log.info({ cacheMaxSize: config.cache.maxSize, cacheTTL: config.cache.ttlSeconds }, 'Cache config')
})

export default app
