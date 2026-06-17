// 性能指标收集器单元测试

import { describe, it, expect, beforeEach } from 'vitest'
import { metrics } from '../src/monitor/metrics'
import type { RenderTiming } from '../src/monitor/metrics'

function makeTiming(overrides: Partial<RenderTiming> = {}): RenderTiming {
  return {
    templateMs: 10,
    resourceMs: 200,
    screenshotMs: 150,
    totalMs: 400,
    timestamp: Date.now(),
    template: 'default',
    cacheHit: false,
    ...overrides,
  }
}

describe('MetricsCollector', () => {
  // 每个测试前重置状态
  beforeEach(() => {
    metrics.reset()
  })

  describe('recordRender', () => {
    it('should increment totalRequests', () => {
      metrics.recordRender(makeTiming())
      expect(metrics.getSnapshot().totalRequests).toBe(1)

      metrics.recordRender(makeTiming())
      expect(metrics.getSnapshot().totalRequests).toBe(2)
    })

    it('should track cache hits separately', () => {
      metrics.recordRender(makeTiming({ cacheHit: true }))
      const snap = metrics.getSnapshot()
      expect(snap.cacheHits).toBe(1)
      expect(snap.cacheMisses).toBe(0)
    })

    it('should track cache misses separately', () => {
      metrics.recordRender(makeTiming({ cacheHit: false }))
      const snap = metrics.getSnapshot()
      expect(snap.cacheHits).toBe(0)
      expect(snap.cacheMisses).toBe(1)
    })

    it('should accumulate stage timings for non-cache requests', () => {
      metrics.recordRender(makeTiming({ cacheHit: false, templateMs: 50, resourceMs: 300, screenshotMs: 200 }))
      metrics.recordRender(makeTiming({ cacheHit: false, templateMs: 30, resourceMs: 100, screenshotMs: 150 }))

      const snap = metrics.getSnapshot()
      expect(snap.avgTemplateMs).toBe(40)
      expect(snap.avgResourceMs).toBe(200)
      expect(snap.avgScreenshotMs).toBe(175)
    })

    it('should not count stage timings for cache hits', () => {
      metrics.recordRender(makeTiming({ cacheHit: true, templateMs: 999, resourceMs: 999, screenshotMs: 999 }))
      const snap = metrics.getSnapshot()
      // Cache hits don't contribute to stage averages
      expect(snap.nonCacheSampleCount).toBe(0)
    })

    it('should store samples in ring buffer up to max capacity', () => {
      for (let i = 0; i < 500; i++) {
        metrics.recordRender(makeTiming({ totalMs: 100 + i }))
      }
      const snap = metrics.getSnapshot()
      expect(snap.sampleCount).toBe(500)
    })
  })

  describe('recordError', () => {
    it('should increment errorCount', () => {
      metrics.recordError()
      metrics.recordError()
      expect(metrics.getSnapshot().errorCount).toBe(2)
    })
  })

  describe('getSnapshot', () => {
    it('should return zero values when no data', () => {
      const snap = metrics.getSnapshot()
      expect(snap.totalRequests).toBe(0)
      expect(snap.cacheHits).toBe(0)
      expect(snap.cacheMisses).toBe(0)
      expect(snap.cacheHitRate).toBe(0)
      expect(snap.errorCount).toBe(0)
      expect(snap.sampleCount).toBe(0)
    })

    it('should compute cacheHitRate correctly', () => {
      metrics.recordRender(makeTiming({ cacheHit: true }))
      metrics.recordRender(makeTiming({ cacheHit: true }))
      metrics.recordRender(makeTiming({ cacheHit: false }))
      metrics.recordRender(makeTiming({ cacheHit: false }))
      expect(metrics.getSnapshot().cacheHitRate).toBe(0.5)
    })

    it('should compute cacheHitRate as 0 when all misses', () => {
      metrics.recordRender(makeTiming({ cacheHit: false }))
      metrics.recordRender(makeTiming({ cacheHit: false }))
      expect(metrics.getSnapshot().cacheHitRate).toBe(0)
    })

    it('should compute cacheHitRate as 1 when all hits', () => {
      metrics.recordRender(makeTiming({ cacheHit: true }))
      metrics.recordRender(makeTiming({ cacheHit: true }))
      expect(metrics.getSnapshot().cacheHitRate).toBe(1)
    })

    it('should compute P50/P95/P99 percentiles', () => {
      // 将 1-100 的样本写入
      for (let i = 1; i <= 100; i++) {
        metrics.recordRender(makeTiming({ totalMs: i, cacheHit: false }))
      }
      const snap = metrics.getSnapshot()
      // P50 of 1..100 is ceil(50/100 * 100) = 50th element = 50
      expect(snap.totalP50).toBe(50)
      // P95 of 1..100 is ceil(95/100 * 100) = 95th element = 95
      expect(snap.totalP95).toBe(95)
      // P99 of 1..100 is ceil(99/100 * 100) = 99th element = 99
      expect(snap.totalP99).toBe(99)
    })

    it('should distinguish cache vs non-cache samples in percentiles', () => {
      // Cache hits should be excluded from percentile calculations
      metrics.recordRender(makeTiming({ cacheHit: true, totalMs: 1 }))
      for (let i = 1; i <= 10; i++) {
        metrics.recordRender(makeTiming({ totalMs: i * 10, cacheHit: false }))
      }
      const snap = metrics.getSnapshot()
      expect(snap.sampleCount).toBe(11) // 1 cache hit + 10 non-cache
      expect(snap.nonCacheSampleCount).toBe(10)
    })
  })

  describe('toPrometheus', () => {
    it('should start with HELP/TYPE comments', () => {
      const result = metrics.toPrometheus()
      expect(result).toContain('# HELP poster_requests_total')
      expect(result).toContain('# TYPE poster_requests_total counter')
    })

    it('should include poster_requests_total counter', () => {
      metrics.recordRender(makeTiming())
      const result = metrics.toPrometheus()
      expect(result).toContain('poster_requests_total 1')
    })

    it('should include cache hit rate gauge', () => {
      const result = metrics.toPrometheus()
      expect(result).toContain('# HELP poster_cache_hit_rate')
      expect(result).toContain('# TYPE poster_cache_hit_rate gauge')
      expect(result).toContain('poster_cache_hit_rate')
    })

    it('should include summary quantiles for render duration', () => {
      const result = metrics.toPrometheus()
      expect(result).toContain('poster_render_duration_ms{quantile="0.5"}')
      expect(result).toContain('poster_render_duration_ms{quantile="0.95"}')
      expect(result).toContain('poster_render_duration_ms{quantile="0.99"}')
    })

    it('should include summary for template duration', () => {
      const result = metrics.toPrometheus()
      expect(result).toContain('poster_template_duration_ms')
    })

    it('should include summary for resource duration', () => {
      const result = metrics.toPrometheus()
      expect(result).toContain('poster_resource_duration_ms')
    })

    it('should include summary for screenshot duration', () => {
      const result = metrics.toPrometheus()
      expect(result).toContain('poster_screenshot_duration_ms')
    })

    it('should include error counter', () => {
      metrics.recordError()
      const result = metrics.toPrometheus()
      expect(result).toContain('poster_errors_total 1')
    })
  })

  describe('reset', () => {
    it('should clear all counters and samples', () => {
      metrics.recordRender(makeTiming())
      metrics.recordRender(makeTiming())
      metrics.recordError()

      metrics.reset()

      const snap = metrics.getSnapshot()
      expect(snap.totalRequests).toBe(0)
      expect(snap.cacheHits).toBe(0)
      expect(snap.cacheMisses).toBe(0)
      expect(snap.errorCount).toBe(0)
      expect(snap.sampleCount).toBe(0)
    })

    it('should return zeros after reset', () => {
      metrics.recordRender(makeTiming({ totalMs: 500 }))
      metrics.reset()
      const snap = metrics.getSnapshot()
      expect(snap.avgTotalMs).toBe(0)
      expect(snap.totalP50).toBe(0)
      expect(snap.totalP95).toBe(0)
    })
  })
})
