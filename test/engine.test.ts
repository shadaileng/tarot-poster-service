// 模板引擎单元测试

import { describe, it, expect } from 'vitest'
import { renderTemplate } from '../src/poster/engine'

describe('renderTemplate', () => {
  // 使用实际存在的模板文件测试
  it('should replace {{ escaped }} with HTML-escaped values', () => {
    const html = renderTemplate('default.html', 'default.css', {
      spreadName: '三牌阵',
      date: '2026-06-17',
      question: '我的未来？',
      cardsHTML: '<div class="card">Test</div>',
      interpretationHTML: '<p>测试解读</p>',
    })
    expect(html).toContain('三牌阵')
    expect(html).toContain('2026-06-17')
    expect(html).toContain('我的未来？')
  })

  it('should inject raw HTML via {{{ }}} without escaping', () => {
    const html = renderTemplate('default.html', 'default.css', {
      cardsHTML: '<div class="card"><img src="x" onerror="alert(1)"></div>',
      interpretationHTML: '',
      spreadName: '',
      date: '',
      question: '',
    })
    // {{{ cardsHTML }}} should be injected raw
    expect(html).toContain('<div class="card"><img src="x" onerror="alert(1)"></div>')
  })

  it('should escape HTML special chars in {{ escaped }}', () => {
    const html = renderTemplate('default.html', 'default.css', {
      spreadName: '<script>alert("xss")</script>',
      date: '',
      question: '',
      cardsHTML: '',
      interpretationHTML: '',
    })
    // Should be escaped, not raw
    expect(html).not.toContain('<script>alert')
    expect(html).toContain('&lt;script&gt;alert')
  })

  it('should handle missing variables gracefully (empty string)', () => {
    const html = renderTemplate('default.html', 'default.css', {
      spreadName: '',
      date: '',
      question: '',
      cardsHTML: '',
      interpretationHTML: '',
    })
    // Should still produce valid HTML without errors
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('</html>')
  })

  it('should inject CSS content via {{ css }}', () => {
    const html = renderTemplate('default.html', 'default.css', {
      spreadName: '',
      date: '',
      question: '',
      cardsHTML: '',
      interpretationHTML: '',
    })
    // default.css should contain .poster-ready
    expect(html).toContain('.poster-ready')
    // Should contain CSS custom properties from theme
    expect(html).toContain('<style>')
    expect(html).toContain('</style>')
  })

  it('should inject theme CSS vars via {{ themeCSSVars }}', () => {
    const themeCSSVars = ':root {\n  --custom-var: #ff0000;\n}'
    const html = renderTemplate('default.html', 'default.css', {
      spreadName: '',
      date: '',
      question: '',
      cardsHTML: '',
      interpretationHTML: '',
    }, themeCSSVars)
    expect(html).toContain('--custom-var: #ff0000')
  })

  it('should handle missing themeCSSVars gracefully (general regex absorbs the placeholder)', () => {
    const html = renderTemplate('default.html', 'default.css', {
      spreadName: '',
      date: '',
      question: '',
      cardsHTML: '',
      interpretationHTML: '',
    })
    // When themeCSSVars is not provided, the {{ }} regex catches {{ themeCSSVars }}
    // and replaces it with empty string (vars['themeCSSVars'] is undefined)
    // The result should still be valid HTML
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('</html>')
    expect(html).not.toContain('{{ themeCSSVars }}')
  })

  it('should produce HTML with poster-ready class', () => {
    const html = renderTemplate('default.html', 'default.css', {
      spreadName: 'Test',
      date: '2026-01-01',
      question: 'Q',
      cardsHTML: '<div>card</div>',
      interpretationHTML: '<p>interpretation</p>',
    })
    // The rendered content should have poster-ready somewhere
    // (it's in the CSS and may be in the HTML body class)
    expect(html).toContain('poster-ready')
  })

  it('should render with different templates', () => {
    const minimalHtml = renderTemplate('minimal.html', 'minimal.css', {
      spreadName: 'Test',
      date: '',
      question: '',
      cardsHTML: '',
      interpretationHTML: '',
    })
    // minimal template may have different structure
    expect(minimalHtml).toContain('<!DOCTYPE html>')
  })
})
