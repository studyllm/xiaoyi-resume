#!/usr/bin/env node
// 门禁入口：本地与持续集成调用同一个命令，判断标准不因托管平台而变。
// 顺序按「失败得最快」排：类型检查最便宜，构建最贵。
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const steps = [
  { name: '类型检查', args: ['run', 'type-check'] },
  { name: '全量并行测试', args: ['run', 'test:parallel'] },
  { name: '打乱顺序测试', args: ['run', 'test:shuffle'] },
  { name: '构建', args: ['run', 'build'] },
]

function run(step) {
  return new Promise((resolveStep) => {
    const child = spawn(npm, step.args, {
      cwd: projectRoot,
      stdio: 'inherit',
      env: process.env,
    })
    child.on('error', (error) => {
      console.error(`✗ ${step.name} 无法启动：${error.message}`)
      resolveStep(1)
    })
    child.on('close', (code) => resolveStep(code ?? 1))
  })
}

const startedAt = Date.now()

for (const [index, step] of steps.entries()) {
  console.log(`\n▶ [${index + 1}/${steps.length}] ${step.name}\n`)
  const code = await run(step)
  if (code !== 0) {
    console.error(`\n✗ 门禁未通过：${step.name} 失败（退出码 ${code}）`)
    console.error('  后续检查不再执行。')
    process.exit(code)
  }
}

const seconds = ((Date.now() - startedAt) / 1000).toFixed(1)
console.log(`\n✓ 门禁通过：${steps.length} 项检查全部成功（用时 ${seconds}s）`)
