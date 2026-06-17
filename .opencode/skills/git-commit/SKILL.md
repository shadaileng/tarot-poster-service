---
name: git-commit
description: >
  Git commit conventions for the poster-service (tarot-poster-service) subproject.
  Use when creating any Git commit. Defines Conventional Commits message
  format, type-to-semver mapping, auto-commit workflow with version bumping,
  amend rules, and atomic commit principle.
---

## 提交格式

```
<type>(poster-service): <中文简短描述>

<body>（可选，多行中文详细说明）

BREAKING CHANGE: <不兼容变更说明>（仅在必要时）
```

## type 类型及语义化版本影响

| type | 用途 | 版本影响 |
|------|------|---------|
| `feat` | 新功能 | **MINOR**（次版本号 +1） |
| `fix` | Bug 修复 | **PATCH**（修订号 +1） |
| `feat!` / `fix!` / `BREAKING CHANGE` | 破坏性变更 | **MAJOR**（主版本号 +1） |
| `docs` / `style` / `refactor` / `perf` / `test` / `chore` / `ci` | 其他 | 不触发版本变更 |

## 规则要求

1. **自动推断 type**：新增功能/接口 → `feat`，修复错误/异常 → `fix`，文档/注释 → `docs`，重构 → `refactor`，依赖/配置 → `chore`
2. **描述使用中文**，简洁明了，不超过 50 字
3. **有破坏性变更时必须标注** `BREAKING CHANGE:` 或在 type 后加 `!`

## 自动提交行为

- 每次代码编写完成后自动 `git add <具体文件>` + `git commit`，**不推送远程**
- 禁止 `git add .` 或 `git add -A` 全量暂存
- 提交消息严格遵循上述格式

## 版本号自动更新

`feat`/`fix` 提交后自动更新 `package.json` 版本号，通过 `--amend` 合并：

| commit type | 版本变更 | 操作 |
|-------------|---------|------|
| `feat` | MINOR | 次版本号 +1，修订号归零 |
| `fix` | PATCH | 修订号 +1 |
| `BREAKING CHANGE` / `feat!` / `fix!` | MAJOR | 主版本号 +1，次版本与修订号归零 |
| `docs` / `style` / `refactor` / `perf` / `test` / `chore` / `ci` | 无变更 | 跳过 |

操作流程：
1. 执行 `git add` + `git commit`
2. 若需要 bump，执行 `npm version <major|minor|patch> --no-git-tag-version`
3. 执行 `git add package.json` + `git commit --amend --no-edit`

## 原子提交原则

> **一个提交只做一件事，一件事完整地放在一个提交里。**

## `--amend` 使用规范

| ✅ 允许 | ❌ 禁止 |
|---------|---------|
| 版本号 bump 合并到同一提交 | 修改已推送的提交（确认无协作者时除外） |
| 漏提交同一逻辑的文件 | 跨任务、跨功能的不同改动合并压缩 |
| 修正提交消息中的笔误 | 用 amend 掩盖错误、频繁 "fix typo" |

## 禁止的提交模式

```bash
git commit -m "wip"          # ❌ 无意义消息
git commit -m "tmp save"     # ❌ 无意义消息
git commit -m "fix"          # ❌ 缺少 scope 和描述
git add . && git commit -m "feat: 大版本更新"  # ❌ 全量暂存 + 海量文件
```

## 提交前自检

- [ ] 本次提交是否只围绕一个目的？
- [ ] 是否遗漏了相关的文件？
- [ ] 是否有调试代码（`console.log`、临时注释）混入？
- [ ] 提交消息是否符合 Conventional Commits 规范？

## 示例

```bash
# 好 ✅
git commit -m "feat(poster-service): 新增海报背景自定义功能"
git commit -m "fix(poster-service): 修复 Puppeteer 截图时字体缺失问题"

# 不好 ❌
git commit -m "update code"
git commit -m "fix"
git commit -m "wip"
```

## 本地历史清理（rebase）

```bash
git rebase -i HEAD~3
# pick 第一个，其余改为 squash / fixup
```

适用于开发过程中产生多个 "wip" 提交需要压缩、提交顺序混乱需要重排等场景。
