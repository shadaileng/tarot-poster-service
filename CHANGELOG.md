# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.1] - 2026-06-17

### Added
- 东八区时区配置，确保服务端时间日志显示正确

### Fixed
- 修复 Docker 镜像构建时缺失 assets 目录和 HTML 模板文件

## [1.1.0] - 2026-06-17

### Added
- 多模板支持：default / minimal / wechat 三套海报风格
- 设计令牌系统（CSS Variables），支持 theme 切换
- 浏览器 Page 池化 + 自动重连机制
- 性能监控仪表板（渲染耗时统计）
- CI/CD 流水线（GitHub Actions）
- pino 结构化日志
- 错误诊断抓取（渲染失败时自动截图）
- 117 个测试用例覆盖 8 个模块

### Changed
- 字体完全本地化，消除 Google Fonts CDN 依赖
- SVG 卡牌图片改为 Base64 Data URI 内嵌，零网络依赖
- HTML 模板从硬编码字符串重构为外部 .html 文件
- emoji 渲染支持（fonts-noto-color-emoji）
- waitUntil 策略从 load 改为 domcontentloaded

### Fixed
- ES Module 下 `__dirname` 不可用
- 缓存键缺少 theme 字段导致不同主题海报缓存污染
- Page 复用导致 Session closed / detached Frame 错误
- `RenderTiming` 类型导出错误
- `document.fonts.ready` 无限等待导致 CDP 协议超时（~180s）

## [1.0.0] - 2026-03-01

### Added
- 初始版本：HTML/CSS + Puppeteer 海报渲染引擎
- RESTful API 端点 `/api/poster`
- Express + TypeScript 项目骨架
