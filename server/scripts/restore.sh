#!/usr/bin/env bash
# 从备份恢复。
#
# **先演练再信它。** 没跑过恢复的备份不算备份（计划 T3.10）。
#
# 用法：
#   S3_BUCKET=... AGE_IDENTITY_FILE=... ./scripts/restore.sh [备份名]
#   不给备份名就用最新的一份
set -euo pipefail

: "${S3_BUCKET:?要设 S3_BUCKET}"
: "${AGE_IDENTITY_FILE:?要设 AGE_IDENTITY_FILE（接收方的 age 私钥）}"

RESTORE_DIR="${RESTORE_DIR:-./backups}"
TARGET_URL="${TARGET_URL:?要设 TARGET_URL（恢复到哪个库）}"
NAME="${1:-}"

if [ -z "$NAME" ]; then
  NAME="$(aws s3 ls "s3://${S3_BUCKET}" | grep -o 'xiaoyi-[0-9T]*\.dump\.age' | sort | tail -1)"
  [ -n "$NAME" ] || { echo "桶里没有备份"; exit 1; }
fi

mkdir -p "$RESTORE_DIR"
echo "▸ 下载 $NAME"
aws s3 cp "s3://${S3_BUCKET}/${NAME}" "${RESTORE_DIR}/${NAME}"

echo "▸ 解密"
age --decrypt --identity "$AGE_IDENTITY_FILE" --output "${RESTORE_DIR}/${NAME}.dump" "${RESTORE_DIR}/${NAME}"

echo "▸ 恢复到 $TARGET_URL"
# --clean 先删掉现有的表：恢复是一次性的替换，不是合并
pg_restore --clean --if-exists --no-owner --dbname "$TARGET_URL" "${RESTORE_DIR}/${NAME}.dump"

echo "✓ 恢复完成。核对一下条数："
echo "  psql \"$TARGET_URL\" -c 'select count(*) from users;'"
