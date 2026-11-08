#!/usr/bin/env bash
# 每晚的数据库备份。
#
# 流程：pg_dump → 加密 → 传对象存储 → 删本地副本。
#
# 依赖：pg_dump（Postgres 客户端）、openssl、aws（对象存储的 CLI）。
# 数据库全部自管（ADR-0002），备份是我们自己负责的——**没有备份等于没有数据**。
#
# 用法：
#   DATABASE_URL=... S3_BUCKET=... AGE_RECIPIENT=... ./scripts/backup.sh
set -euo pipefail

: "${DATABASE_URL:?要设 DATABASE_URL}"
: "${S3_BUCKET:?要设 S3_BUCKET}"
: "${AGE_RECIPIENT:?要设 AGE_RECIPIENT（接收方的 age 公钥）}"

BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_LOCAL="${KEEP_LOCAL:-0}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
NAME="xiaoyi-${STAMP}.dump.age"

mkdir -p "$BACKUP_DIR"

echo "▸ 导出 $NAME"
pg_dump --format=custom --no-owner "$DATABASE_URL" > "${BACKUP_DIR}/${NAME}.dump"

echo "▸ 加密"
# 用 age 公钥加密：备份密钥与备份分开存放（备份拿到手也解不开）
age --recipient "$AGE_RECIPIENT" --output "${BACKUP_DIR}/${NAME}" "${BACKUP_DIR}/${NAME}.dump"
rm -f "${BACKUP_DIR}/${NAME}.dump"

echo "▸ 上传到 s3://${S3_BUCKET}"
aws s3 cp "${BACKUP_DIR}/${NAME}" "s3://${S3_BUCKET}/${NAME}" --storage-class STANDARD_IA

if [ "$KEEP_LOCAL" != "1" ]; then
  rm -f "${BACKUP_DIR}/${NAME}"
fi

echo "✓ 备份完成：${NAME}"
