// 主题系统单元测试

import { describe, it, expect } from 'vitest'
import { getTheme, themeToCSSVars } from '../src/poster/theme'

describe('getTheme', () => {
  it('should return dark theme by default', () => {
    const theme = getTheme()
    expect(theme.name).toBe('dark')
  })

  it('should return dark theme when name is undefined', () => {
    const theme = getTheme(undefined)
    expect(theme.name).toBe('dark')
  })

  it('should return light theme when specified', () => {
    const theme = getTheme('light')
    expect(theme.name).toBe('light')
  })

  it('should return dark theme on unknown name (fallback)', () => {
    const theme = getTheme('unknown-theme-name')
    expect(theme.name).toBe('dark')
  })

  it('should return dark theme when explicitly requesting dark', () => {
    const theme = getTheme('dark')
    expect(theme.name).toBe('dark')
  })

  it('dark theme should have complete color tokens', () => {
    const theme = getTheme('dark')
    expect(theme.colors.bg).toBeDefined()
    expect(theme.colors.bgGradient).toBeDefined()
    expect(theme.colors.text).toBeDefined()
    expect(theme.colors.textSecondary).toBeDefined()
    expect(theme.colors.accent).toBeDefined()
    expect(theme.colors.accentGlow).toBeDefined()
    expect(theme.colors.rgbText).toBeDefined()
    expect(theme.colors.rgbAccent).toBeDefined()
    expect(theme.colors.rgbSurface).toBeDefined()
    expect(theme.colors.rgbShadow).toBeDefined()
  })

  it('light theme should have complete color tokens', () => {
    const theme = getTheme('light')
    expect(theme.colors.bg).toBeDefined()
    expect(theme.colors.bgGradient).toBeDefined()
    expect(theme.colors.text).toBeDefined()
  })

  it('theme should have typography tokens', () => {
    const theme = getTheme('dark')
    expect(theme.typography.fontFamily).toBeDefined()
    expect(theme.typography.fontSizeTitle).toBeDefined()
    expect(theme.typography.fontWeightTitle).toBeDefined()
    expect(theme.typography.fontSizeBody).toBeDefined()
    expect(theme.typography.lineHeightBody).toBeDefined()
  })

  it('theme should have spacing tokens', () => {
    const theme = getTheme('dark')
    expect(theme.spacing.pageV).toBeDefined()
    expect(theme.spacing.pageH).toBeDefined()
    expect(theme.spacing.cardGap).toBeDefined()
    expect(theme.spacing.sectionGap).toBeDefined()
  })

  it('theme should have radius tokens', () => {
    const theme = getTheme('dark')
    expect(theme.radius.card).toBeDefined()
    expect(theme.radius.section).toBeDefined()
  })
})

describe('themeToCSSVars', () => {
  it('should output CSS :root block', () => {
    const theme = getTheme('dark')
    const css = themeToCSSVars(theme)
    expect(css).toContain(':root {')
    expect(css).toContain('}')
  })

  it('should include color CSS variables', () => {
    const theme = getTheme('dark')
    const css = themeToCSSVars(theme)
    expect(css).toContain('--t-color-bg:')
    expect(css).toContain('--t-color-bg-gradient:')
    expect(css).toContain('--t-color-text:')
    expect(css).toContain('--t-color-text-secondary:')
    expect(css).toContain('--t-color-accent:')
    expect(css).toContain('--t-color-accent-glow:')
  })

  it('should include font CSS variables', () => {
    const theme = getTheme('dark')
    const css = themeToCSSVars(theme)
    expect(css).toContain('--t-font-family:')
    expect(css).toContain('--t-font-size-title:')
    expect(css).toContain('--t-font-weight-title:')
    expect(css).toContain('--t-font-size-body:')
    expect(css).toContain('--t-line-height-body:')
  })

  it('should include spacing CSS variables', () => {
    const theme = getTheme('dark')
    const css = themeToCSSVars(theme)
    expect(css).toContain('--t-spacing-page-v:')
    expect(css).toContain('--t-spacing-page-h:')
    expect(css).toContain('--t-spacing-card-gap:')
    expect(css).toContain('--t-spacing-section-gap:')
  })

  it('should include radius CSS variables', () => {
    const theme = getTheme('dark')
    const css = themeToCSSVars(theme)
    expect(css).toContain('--t-radius-card:')
    expect(css).toContain('--t-radius-section:')
  })

  it('dark and light themes should have different bg colors', () => {
    const darkTheme = getTheme('dark')
    const lightTheme = getTheme('light')
    const darkCss = themeToCSSVars(darkTheme)
    const lightCss = themeToCSSVars(lightTheme)
    expect(darkCss).not.toBe(lightCss)
    // dark bg is #0a0a1a, light bg is #faf6ef
    expect(darkCss).toContain('--t-color-bg: #0a0a1a')
    expect(lightCss).toContain('--t-color-bg: #faf6ef')
  })

  it('should include rgb color variables', () => {
    const theme = getTheme('dark')
    const css = themeToCSSVars(theme)
    expect(css).toContain('--t-rgb-text:')
    expect(css).toContain('--t-rgb-accent:')
    expect(css).toContain('--t-rgb-surface:')
    expect(css).toContain('--t-rgb-shadow:')
  })
})
