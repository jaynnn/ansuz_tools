#!/bin/bash

# Token 消耗排行榜
# 查看每个用户消耗的 LLM Token 统计

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 数据库路径
DB_PATH="${DATABASE_PATH:-$SCRIPT_DIR/backend/database.sqlite}"

if [ ! -f "$DB_PATH" ]; then
  echo "错误：数据库文件不存在: $DB_PATH"
  echo "请确认 DATABASE_PATH 环境变量或数据库文件位置。"
  exit 1
fi

echo "============================================"
echo "        Token 消耗排行榜"
echo "============================================"
echo ""

echo "【用户总消耗排行】"
echo "--------------------------------------------"
printf "%-6s %-12s %-10s %-10s %-10s %-6s\n" "排名" "用户名" "提示Token" "完成Token" "总Token" "次数"
echo "--------------------------------------------"

sqlite3 -separator '|' "$DB_PATH" "
  SELECT
    u.username,
    COALESCE(SUM(t.prompt_tokens), 0) as prompt_total,
    COALESCE(SUM(t.completion_tokens), 0) as completion_total,
    COALESCE(SUM(t.total_tokens), 0) as token_total,
    COUNT(t.id) as call_count
  FROM users u
  LEFT JOIN token_usage t ON u.id = t.user_id
  GROUP BY u.id
  ORDER BY token_total DESC;
" | awk -F'|' '{
  NR_COUNT++;
  printf "%-6s %-12s %-10s %-10s %-10s %-6s\n", NR_COUNT, $1, $2, $3, $4, $5
}'

echo ""
echo "【按场景分类统计】"
echo "--------------------------------------------"
printf "%-20s %-10s %-10s %-6s\n" "场景" "总Token" "平均Token" "次数"
echo "--------------------------------------------"

sqlite3 -separator '|' "$DB_PATH" "
  SELECT
    context,
    SUM(total_tokens) as token_total,
    ROUND(AVG(total_tokens)) as token_avg,
    COUNT(*) as call_count
  FROM token_usage
  GROUP BY context
  ORDER BY token_total DESC;
" | awk -F'|' '{
  printf "%-20s %-10s %-10s %-6s\n", $1, $2, $3, $4
}'

echo ""
echo "【最近7天每日消耗趋势】"
echo "--------------------------------------------"
printf "%-12s %-10s %-6s\n" "日期" "总Token" "次数"
echo "--------------------------------------------"

sqlite3 -separator '|' "$DB_PATH" "
  SELECT
    DATE(created_at) as day,
    SUM(total_tokens) as token_total,
    COUNT(*) as call_count
  FROM token_usage
  WHERE created_at >= DATE('now', '-7 days')
  GROUP BY day
  ORDER BY day DESC;
" | awk -F'|' '{
  printf "%-12s %-10s %-6s\n", $1, $2, $3
}'

echo ""
echo "============================================"
