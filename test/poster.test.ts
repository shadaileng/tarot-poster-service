// 海报生成测试

import { describe, it, expect } from 'vitest'
import { buildPosterHTML } from '../src/poster/template'
import { posterCache } from '../src/cache'
import type { PosterData } from '../src/poster/types'

const mockData: PosterData = {
  cards: [
    {
      name: '愚者',
      image: 'https://example.com/fool.png',
      position: '现状',
      orientation: 'upright',
      meaning: '新的开始，冒险精神',
      keywords: ['开始', '冒险', '天真', '自由'],
      type: 'major',
      number: 0,
    },
    {
      name: '女祭司',
      image: 'https://example.com/priestess.png',
      position: '未来',
      orientation: 'reversed',
      meaning: '直觉，内在智慧',
      keywords: ['直觉', '神秘', '内在'],
      type: 'major',
      number: 2,
    },
  ],
  question: '我的未来会怎样？',
  spreadName: '三牌阵',
  interpretation: '这是一段关于成长与探索的旅程...',
  date: '2026-06-12',
}

describe('poster template', () => {
  it('should generate valid HTML', () => {
    const html = buildPosterHTML(mockData)
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('塔 罗 占 卜')
    expect(html).toContain('愚者')
    expect(html).toContain('女祭司')
    expect(html).toContain('我的未来会怎样？')
    expect(html).toContain('三牌阵')
    expect(html).toContain('poster-ready')
  })

  it('should escape HTML in user input', () => {
    const xssData = { ...mockData, question: '<script>alert("xss")</script>' }
    const html = buildPosterHTML(xssData)
    expect(html).not.toContain('<script>alert')
    expect(html).toContain('&lt;script&gt;alert')
  })
})

describe('LRU cache', () => {
  it('should store and retrieve data', () => {
    const cache = posterCache
    const key = cache.generateKey(mockData)
    const data = Buffer.from('test-poster-data')

    cache.set(key, data)
    expect(cache.get(key)).toEqual(data)
  })

  it('should generate same key for same data', () => {
    const key1 = posterCache.generateKey(mockData)
    const key2 = posterCache.generateKey({ ...mockData })
    expect(key1).toBe(key2)
  })

  it('should generate different key for different data', () => {
    const key1 = posterCache.generateKey(mockData)
    const key2 = posterCache.generateKey({ ...mockData, question: '其他问题' })
    expect(key1).not.toBe(key2)
  })
})
