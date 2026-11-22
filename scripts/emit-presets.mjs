/**
 * 一次性生成器：把旧版 __shell/presets 下的三段原文逐字搬进 TS。
 * 生成后不再需要运行；留在 scripts 里是为了以后能核对改动。
 */
import { readFileSync, writeFileSync } from 'node:fs'

const SRC = 'D:/deepseek/ds-shell/app/web/__shell/presets'
const OUT = 'D:/deepseek/gaia/web/src/features/roles/presets.ts'

const read = (name) => readFileSync(`${SRC}/${name}`, 'utf8').replace(/\r\n/g, '\n').replace(/\n+$/, '')

const escape = (text) =>
  text
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${')

const body = [
  '/**',
  ' * 系统自带角色（Gaia）的提示词与技能。',
  ' * 三段正文逐字来自旧版 app/web/__shell/presets/*.txt，改文案请直接改这里。',
  ' */',
  '',
  'export const GAIA_SYSTEM_PROMPT = `' + escape(read('gaia-system.txt')) + '`',
  '',
  '/** 技能：把模糊的「我想要个角色」变成可导入的角色卡 */',
  'export const SKILL_CHARACTER_CARD = `' + escape(read('skill-character-card.txt')) + '`',
  '',
  '/** 技能：写、改、诊断系统提示词 */',
  'export const SKILL_SYSTEM_PROMPT = `' + escape(read('skill-system-prompt.txt')) + '`',
  '',
].join('\n')

writeFileSync(OUT, body, 'utf8')
console.log(`wrote ${OUT} (${body.length} bytes)`)
