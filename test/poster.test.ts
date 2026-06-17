// 海报生成测试

import { describe, it, expect } from 'vitest'
import { buildPosterHTML } from '../src/poster/template'
import { posterCache, LRUCache } from '../src/cache'
import type { PosterData } from '../src/poster/types'

const mockData: PosterData = {
  cards: [
    {
      name: '愚者',
      image: '/static/cards/major-00.svg',
      position: '现状',
      orientation: 'upright',
      meaning: '新的开始，冒险精神',
      keywords: ['开始', '冒险', '天真', '自由'],
      type: 'major',
      number: 0,
    },
    {
      name: '女祭司',
      image: '/static/cards/major-02.svg',
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
  interpretation: '逐张牌解读...\n\n✨ 综合解读\n这是一段关于成长与探索的旅程...',
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

  it('should embed card images as base64 data URI', () => {
    const html = buildPosterHTML(mockData)
    expect(html).toContain('data:image/svg+xml;base64,')
    // 不应包含远程 URL
    expect(html).not.toContain('http://localhost:3000/cards/')
  })

  it('should only show comprehensive interpretation after ✨ 综合解读', () => {
    const html = buildPosterHTML(mockData)
    // 应该包含综合解读的内容
    expect(html).toContain('这是一段关于成长与探索的旅程')
    // 不应该包含 "逐张牌解读" 的内容
    expect(html).not.toContain('逐张牌解读')
  })

  it('should handle interpretation without comprehensive marker', () => {
    const noMarker = {
      ...mockData,
      interpretation: '直接的综合解读文本',
    }
    const html = buildPosterHTML(noMarker)
    expect(html).toContain('直接的综合解读文本')
  })

  it('should use comprehensiveInterpretation field when present', () => {
    const withComprehensive = {
      ...mockData,
      interpretation: '逐张牌解读...',
      comprehensiveInterpretation: '这是专门提取的综合解读内容',
    }
    const html = buildPosterHTML(withComprehensive)
    // 应该包含 comprehensiveInterpretation 的内容
    expect(html).toContain('这是专门提取的综合解读内容')
    // 不应该包含 interpretation 的逐张牌解读
    expect(html).not.toContain('逐张牌解读')
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

  it('should return null for non-existent key', () => {
    expect(posterCache.get('non-existent-key-xyz')).toBeNull()
  })

  it('should generate key including template parameter', () => {
    const keyDefault = posterCache.generateKey(mockData)
    const keyWechat = posterCache.generateKey({ ...mockData, template: 'wechat' })
    expect(keyDefault).not.toBe(keyWechat)
  })

  it('should generate key including theme parameter', () => {
    const keyDefault = posterCache.generateKey(mockData)
    const keyLight = posterCache.generateKey({ ...mockData, theme: 'light' })
    expect(keyDefault).not.toBe(keyLight)
  })

  it('should generate key including comprehensiveInterpretation', () => {
    const keyWithout = posterCache.generateKey(mockData)
    const keyWith = posterCache.generateKey({
      ...mockData,
      comprehensiveInterpretation: '自定义综合解读',
    })
    expect(keyWithout).not.toBe(keyWith)
  })

  it('should move accessed entry to end (LRU) and evict oldest', () => {
    // 使用小容量独立缓存实例测试 LRU 行为
    const cache = new LRUCache(3, 3600)

    cache.set('key1', Buffer.from('data1'))
    cache.set('key2', Buffer.from('data2'))
    cache.set('key3', Buffer.from('data3'))

    // 访问 key1 使其成为最近使用
    expect(cache.get('key1')).toEqual(Buffer.from('data1'))

    // 插入 key4 应淘汰 key2（最久未使用）
    cache.set('key4', Buffer.from('data4'))

    expect(cache.get('key1')).not.toBeNull() // 仍存在（最近使用）
    expect(cache.get('key2')).toBeNull() // 被淘汰
    expect(cache.get('key3')).not.toBeNull() // 仍存在
    expect(cache.get('key4')).not.toBeNull() // 新插入
  })

  it('should evict oldest entry when capacity exceeded', () => {
    const cache = new LRUCache(2, 3600)

    cache.set('a', Buffer.from('1'))
    cache.set('b', Buffer.from('2'))
    // 容量已满，插入 c 应淘汰 a（最旧）
    cache.set('c', Buffer.from('3'))

    expect(cache.get('a')).toBeNull()
    expect(cache.get('b')).not.toBeNull()
    expect(cache.get('c')).not.toBeNull()
    expect(cache.size).toBe(2)
  })

  it('should expose correct size property', () => {
    const cache = new LRUCache(10, 3600)
    expect(cache.size).toBe(0)

    cache.set('a', Buffer.from('1'))
    expect(cache.size).toBe(1)

    cache.set('b', Buffer.from('2'))
    expect(cache.size).toBe(2)

    cache.get('a') // 不应改变 size
    expect(cache.size).toBe(2)
  })

  it('should expose maxSize property', () => {
    const cache = new LRUCache(42, 3600)
    expect(cache.maxSize).toBe(42)
  })
})
