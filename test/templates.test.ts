// 模板注册表单元测试

import { describe, it, expect } from 'vitest'
import { getTemplate } from '../src/poster/templates/index'

describe('getTemplate', () => {
  it('should return default template when no name provided', () => {
    const tmpl = getTemplate()
    expect(tmpl.name).toBe('default')
    expect(tmpl.html).toBe('default.html')
    expect(tmpl.css).toBe('default.css')
  })

  it('should return default template when undefined name', () => {
    const tmpl = getTemplate(undefined)
    expect(tmpl.name).toBe('default')
  })

  it('should return minimal template', () => {
    const tmpl = getTemplate('minimal')
    expect(tmpl.name).toBe('minimal')
    expect(tmpl.html).toBe('minimal.html')
    expect(tmpl.css).toBe('minimal.css')
  })

  it('should return wechat template', () => {
    const tmpl = getTemplate('wechat')
    expect(tmpl.name).toBe('wechat')
    expect(tmpl.html).toBe('wechat.html')
    expect(tmpl.css).toBe('wechat.css')
  })

  it('should return default template explicitly', () => {
    const tmpl = getTemplate('default')
    expect(tmpl.name).toBe('default')
  })

  it('should fallback to default on unknown template', () => {
    const tmpl = getTemplate('nonexistent-template-xyz')
    expect(tmpl.name).toBe('default')
  })

  it('should have correct width for default template', () => {
    const tmpl = getTemplate('default')
    expect(tmpl.width).toBe(750)
  })

  it('should have correct width for minimal template', () => {
    const tmpl = getTemplate('minimal')
    expect(tmpl.width).toBe(750)
  })

  it('should have correct width for wechat template', () => {
    const tmpl = getTemplate('wechat')
    expect(tmpl.width).toBe(1080)
  })

  it('should have correct defaultTheme for default template', () => {
    const tmpl = getTemplate('default')
    expect(tmpl.defaultTheme).toBe('dark')
  })

  it('should have correct defaultTheme for minimal template', () => {
    const tmpl = getTemplate('minimal')
    expect(tmpl.defaultTheme).toBe('light')
  })

  it('should have correct defaultTheme for wechat template', () => {
    const tmpl = getTemplate('wechat')
    expect(tmpl.defaultTheme).toBe('dark')
  })

  it('all templates should have required fields', () => {
    const templates = ['default', 'minimal', 'wechat'] as const
    for (const name of templates) {
      const tmpl = getTemplate(name)
      expect(tmpl.name).toBeTruthy()
      expect(tmpl.html).toBeTruthy()
      expect(tmpl.css).toBeTruthy()
      expect(tmpl.width).toBeGreaterThan(0)
      expect(tmpl.defaultTheme).toBeTruthy()
    }
  })
})
