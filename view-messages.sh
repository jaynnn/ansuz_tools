#!/bin/bash

# 查看用户留言
# 用法：./view-messages.sh [选项]
#   无参数    - 查看最近 20 条留言
#   -a        - 查看所有留言
#   -n <数量>  - 查看最近 N 条留言
#   -c <类型>  - 按类型筛选 (tool_request / suggestion / bug_report / other)

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 数据库路径
DB_PATH="${DATABASE_PATH:-$SCRIPT_DIR/backend/database.sqlite}"

if [ ! -f "$DB_PATH" ]; then
  echo "错误：数据库文件不存在: $DB_PATH"
  echo "请确认 DATABASE_PATH 环境变量或数据库文件位置。"
  exit 1
fi

# 默认参数
LIMIT=20
CATEGORY=""
SHOW_ALL=false

# 解析参数
while getopts "an:c:" opt; do
  case $opt in
    a) SHOW_ALL=true ;;
    n) LIMIT="$OPTARG" ;;
    c) CATEGORY="$OPTARG" ;;
    *) echo "用法: $0 [-a] [-n 数量] [-c 类型]"; exit 1 ;;
  esac
done

echo "============================================"
echo "           用户留言板"
echo "============================================"
echo ""

# 构建查询
WHERE_CLAUSE=""
if [ -n "$CATEGORY" ]; then
  WHERE_CLAUSE="WHERE m.category = '$CATEGORY'"
fi

LIMIT_CLAUSE=""
if [ "$SHOW_ALL" = false ]; then
  LIMIT_CLAUSE="LIMIT $LIMIT"
fi

echo "【留言统计】"
echo "--------------------------------------------"
sqlite3 "$DB_PATH" "
  SELECT
    CASE category
      WHEN 'tool_request' THEN '🛠 工具许愿'
      WHEN 'suggestion'   THEN '💡 建议反馈'
      WHEN 'bug_report'   THEN '🐛 Bug报告'
      ELSE '💬 其他'
    END as type,
    COUNT(*) as count
  FROM messages
  GROUP BY category
  ORDER BY count DESC;
"
echo ""

echo "【留言列表】"
echo "--------------------------------------------"

sqlite3 -separator '|' "$DB_PATH" "
  SELECT
    m.id,
    u.username,
    u.nickname,
    CASE m.category
      WHEN 'tool_request' THEN '工具许愿'
      WHEN 'suggestion'   THEN '建议反馈'
      WHEN 'bug_report'   THEN 'Bug报告'
      ELSE '其他'
    END,
    m.content,
    m.created_at
  FROM messages m
  JOIN users u ON m.user_id = u.id
  $WHERE_CLAUSE
  ORDER BY m.created_at DESC
  $LIMIT_CLAUSE;
" | while IFS='|' read -r id username nickname category content created_at; do
  display_name="${nickname:-$username}"
  echo "[$id] [$created_at] [$category] $display_name:"
  echo "    $content"
  echo "--------------------------------------------"
done

echo ""
echo "============================================"
