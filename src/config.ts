// 统一环境变量管理

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // 时区（默认东八区，部署时可覆盖）
  timezone: process.env.TZ || 'Asia/Shanghai',

  // API 鉴权（不配置则跳过）
  apiKey: process.env.API_KEY || '',

  // CORS
  corsOrigin: process.env.CORS_ORIGIN || '*',

  // Puppeteer 配置
  puppeteer: {
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: (process.env.PUPPETEER_ARGS || '--no-sandbox,--disable-setuid-sandbox,--disable-dev-shm-usage').split(','),
  },

  // 缓存配置
  cache: {
    maxSize: parseInt(process.env.CACHE_MAX_SIZE || '100', 10),
    ttlSeconds: parseInt(process.env.CACHE_TTL_SECONDS || '3600', 10),
  },

  // 海报配置
  poster: {
    width: parseInt(process.env.POSTER_WIDTH || '750', 10),
    height: parseInt(process.env.POSTER_HEIGHT || '1334', 10),
  },

  // 浏览器 Page 池配置
  pool: {
    maxPages: parseInt(process.env.POOL_MAX_PAGES || '4', 10),
    acquireTimeoutMs: parseInt(process.env.POOL_ACQUIRE_TIMEOUT_MS || '30000', 10),
  },
}
