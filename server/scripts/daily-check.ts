/**
 * 每日巡检：有问题就发邮件，没问题就安静退出。
 *
 * 查三样（runbook 的「监控」一节）：
 * 1. 服务端活着吗
 * 2. 数据库连得上吗、连接数与表体积正常吗、磁盘还有多少
 * 3. 昨晚的备份成功了吗
 *
 * 用服务端自己那套 SMTP 配置发信——不另开一个通道，密钥也只有一份。
 * 需要 `ALERT_EMAIL`（收告警的地址）与 `SMTP_*`。
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import nodemailer from 'nodemailer'
import { Pool } from 'pg'

const run = promisify(execFile)

const DATABASE_URL = process.env.DATABASE_URL
const ALERT_EMAIL = process.env.ALERT_EMAIL
const SMTP_HOST = process.env.SMTP_HOST
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 465)
const SMTP_SECURE = process.env.SMTP_SECURE !== 'false'
const SMTP_USER = process.env.SMTP_USER
const SMTP_PASS = process.env.SMTP_PASS
const MAIL_FROM = process.env.MAIL_FROM
const HEALTH_URL = process.env.HEALTH_URL ?? 'http://127.0.0.1:3000/api/v1/healthz'
const S3_BUCKET = process.env.S3_BUCKET

/** 备份最多允许隔多久没成功。超过就算没备份。 */
const BACKUP_MAX_AGE_HOURS = 26

/** 数据库体积上限。超过就该清旧数据了。 */
const DATABASE_MAX_BYTES = 2 * 1024 * 1024 * 1024

interface Problem {
  what: string
  detail: string
}

const problems: Problem[] = []

async function checkService(): Promise<void> {
  try {
    const response = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(10_000) })
    if (!response.ok) problems.push({ what: '服务端', detail: `健康检查返回 ${response.status}` })
  } catch (error) {
    problems.push({ what: '服务端', detail: `连不上 ${HEALTH_URL}：${(error as Error).message}` })
  }
}

async function checkDatabase(pool: Pool): Promise<void> {
  try {
    const connections = await pool.query<{ count: string }>(
      'select count(*) from pg_stat_activity',
    )
    const used = Number(connections.rows[0]?.count ?? 0)
    if (used > 100) problems.push({ what: '数据库连接数', detail: `${used} 个连接，偏多` })

    // 比字节，不比 pg_size_pretty 的字符串——那个带单位，数字符会误判
    const size = await pool.query<{ bytes: string }>(
      'select pg_database_size(current_database())::text as bytes',
    )
    const bytes = Number(size.rows[0]?.bytes ?? 0)
    if (bytes > DATABASE_MAX_BYTES) {
      problems.push({
        what: '数据库体积',
        detail: `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB，超过 ${(
          DATABASE_MAX_BYTES /
          1024 /
          1024 /
          1024
        ).toFixed(0)} GB，该清旧数据了`,
      })
    }
  } catch (error) {
    problems.push({ what: '数据库', detail: (error as Error).message })
  }
}

async function checkDisk(): Promise<void> {
  try {
    const { stdout } = await run('df', ['-h', '/'])
    const lines = stdout.trim().split('\n')
    const usage = lines[lines.length - 1]?.trim().split(/\s+/)[4] ?? ''
    const percent = Number(usage.replace('%', ''))
    if (percent >= 80) {
      problems.push({ what: '磁盘', detail: `根分区用了 ${usage}，超过 80%` })
    }
  } catch (error) {
    problems.push({ what: '磁盘', detail: (error as Error).message })
  }
}

async function checkBackup(): Promise<void> {
  if (!S3_BUCKET) return
  try {
    const { stdout } = await run('aws', [
      's3',
      'ls',
      `s3://${S3_BUCKET}`,
      '--region',
      process.env.AWS_REGION ?? 'cn-hangzhou',
    ])
    const times = [...stdout.matchAll(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/g)].map((m) =>
      new Date(m[1]!.replace(' ', 'T') + 'Z').getTime(),
    )
    const newest = Math.max(...times)
    const hours = (Date.now() - newest) / 3_600_000
    if (!Number.isFinite(hours) || hours > BACKUP_MAX_AGE_HOURS) {
      problems.push({
        what: '备份',
        detail: `最近一次备份距今 ${hours.toFixed(1)} 小时，超过 ${BACKUP_MAX_AGE_HOURS} 小时`,
      })
    }
  } catch (error) {
    problems.push({ what: '备份', detail: `查不到备份：${(error as Error).message}` })
  }
}

async function main(): Promise<void> {
  if (!DATABASE_URL) {
    console.error('缺少 DATABASE_URL')
    process.exit(1)
  }

  const pool = new Pool({ connectionString: DATABASE_URL })
  await checkService()
  await checkDatabase(pool)
  await checkDisk()
  await checkBackup()
  await pool.end()

  if (problems.length === 0) {
    console.log('✓ 巡检通过')
    return
  }

  const body = problems.map((p) => `【${p.what}】${p.detail}`).join('\n')
  console.error(`✗ 巡检发现 ${problems.length} 个问题：\n${body}`)

  if (ALERT_EMAIL && SMTP_HOST && SMTP_USER && SMTP_PASS && MAIL_FROM) {
    const transport = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
    await transport.sendMail({
      from: MAIL_FROM,
      to: ALERT_EMAIL,
      subject: `小奕·简历 巡检告警：${problems.length} 个问题`,
      text: `${body}\n\n处理步骤见 docs/ops/runbook.md 的「故障处置」。`,
    })
    console.log(`告警邮件已发到 ${ALERT_EMAIL}`)
  } else {
    console.error('没有配置 ALERT_EMAIL 或 SMTP_*，告警只打在日志里')
  }

  process.exit(1)
}

await main()
