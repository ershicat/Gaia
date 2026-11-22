#!/usr/bin/env node
/**
 * 积木边界检查（构建前必跑）。
 *
 * 规则：
 *  1. features/<A> 不许 import features/<B>（跨积木只能走事件 / 插槽 / 装配层注入）
 *  2. platform 不许 import features/ 与 components/ /
 *     services/ 只许 import type（它是最底层，不许反向依赖业务实现）
 *
 * 违反任何一条直接退出码 1，构建中止。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const ROOT = 'D:/deepseek/gaia/web/src'
const FEATURES = path.join(ROOT, 'features')
const PLATFORM = path.join(ROOT, 'platform')

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) {
      walk(full, out)
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(full)
    }
  }
  return out
}

const stripExtension = (p) => p.replace(/\.(ts|tsx|js|jsx)$/, '')

/** 把 import specifier 解析成 src 下的绝对路径（去掉扩展名便于比较） */
const resolveSpec = (file, spec) => {
  if (!spec.startsWith('.')) {
    return null
  }
  return stripExtension(path.resolve(path.dirname(file), spec))
}

const featuresOf = (absPath) => {
  const rel = path.relative(FEATURES, absPath)
  if (rel.startsWith('..')) {
    return null
  }
  const parts = rel.split(path.sep)
  return parts.length > 1 ? parts[0] : null
}

const violations = []
/** 抓取 import 语句，并记录是否 type-only（多行 import 也能吃到 spec） */
const importRe = /import\s+(type\s+)?[^'"\n]*?from\s+['"]([^'"]+)['"]/g

const importsOf = (file) => {
  const src = readFileSync(file, 'utf8')
  const out = []
  for (const match of src.matchAll(importRe)) {
    out.push({ typeOnly: Boolean(match[1]), spec: match[2] })
  }
  return out
}

const blocks = readdirSync(FEATURES).filter((n) => statSync(path.join(FEATURES, n)).isDirectory())

for (const block of blocks) {
  for (const file of walk(path.join(FEATURES, block))) {
    for (const { spec } of importsOf(file)) {
      const target = resolveSpec(file, spec)
      if (!target) {
        continue
      }
      const other = featuresOf(target)
      if (other && other !== block) {
        violations.push(
          `${path.relative(ROOT, file)} → features/${other}（积木之间禁止直接 import，请改走事件或插槽）`
        )
      }
    }
  }
}

for (const file of walk(PLATFORM)) {
  for (const { spec, typeOnly } of importsOf(file)) {
    const target = resolveSpec(file, spec)
    if (!target) {
      continue
    }
    const rel = path.relative(ROOT, target)
    if (rel.startsWith('features' + path.sep) || rel.startsWith('components' + path.sep)) {
      violations.push(`${path.relative(ROOT, file)} → ${rel}（platform 不许依赖业务代码）`)
      continue
    }
    if (rel.startsWith('services' + path.sep) && !typeOnly) {
      violations.push(`${path.relative(ROOT, file)} → ${rel}（platform 对 services 只许 import type）`)
    }
  }
}

console.log(`blocks: ${blocks.join(', ') || '(none)'}`)

if (violations.length > 0) {
  console.error('\n边界违规：')
  for (const item of violations) {
    console.error('  - ' + item)
  }
  process.exit(1)
}

console.log('boundaries ok')
