// Express 服务入口
// 提供海报生成 API、健康检查、根路径（HF Spaces 兼容）

import 'dotenv/config'
import path from 'path'
import { fileURLToPath } from 'url'
import express from 'express'
import { config } from './config'
import { corsMiddleware } from './middleware/cors'
import { authMiddleware } from './middleware/auth'
import { buildPosterHTML } from './poster/template'
import { renderPoster } from './poster/render'
import { posterCache } from './cache'
import type { PosterData } from './poster/types'

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
    },
  })
})

// ========== 健康检查 ==========
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    cache: {
      size: posterCache.size,
      maxSize: posterCache.maxSize,
    },
  })
})

// ========== 海报生成 API ==========
app.post('/poster', authMiddleware, async (req, res) => {
  try {
    const posterData = req.body as PosterData

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
      return
    }

    // 生成海报
    const html = buildPosterHTML(posterData)
    const imageBuffer = await renderPoster(html)

    // 缓存
    posterCache.set(cacheKey, imageBuffer)

    res.set('Content-Type', 'image/png')
    res.set('X-Cache', 'MISS')
    res.set('Cache-Control', 'public, max-age=3600')
    res.send(imageBuffer)
  } catch (error) {
    console.error('Poster generation failed:', error)
    res.status(500).json({ error: 'Poster generation failed' })
  }
})

// ========== 启动服务 ==========
app.listen(config.port, '0.0.0.0', () => {
  console.log(`🃏 Tarot Poster Service running on http://0.0.0.0:${config.port}`)
  console.log(`   Environment: ${config.nodeEnv}`)
  console.log(`   Auth: ${config.apiKey ? 'enabled' : 'disabled'}`)
  console.log(`   Cache: max ${config.cache.maxSize} entries, TTL ${config.cache.ttlSeconds}s`)
})

export default app
