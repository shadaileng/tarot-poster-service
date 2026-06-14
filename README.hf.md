---
title: 塔罗牌海报生成
emoji: 🔮
colorFrom: purple
colorTo: blue
sdk: docker
pinned: false
---

## 塔罗牌海报生成微服务

基于 Node.js + Express + TypeScript + Puppeteer 的塔罗牌海报生成服务。

### API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 服务信息 |
| GET | `/health` | 健康检查 |
| POST | `/poster` | 生成海报图片（返回 PNG） |
