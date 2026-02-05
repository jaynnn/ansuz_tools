#!/bin/bash

# 停止 Ansuz Tools 服务

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/backend"

if [ ! -f "ansuz.pid" ]; then
    echo "Ansuz Tools 未运行"
    exit 1
fi

PID=$(cat ansuz.pid)
if ps -p $PID > /dev/null 2>&1; then
    echo "正在停止 Ansuz Tools (PID: $PID)..."
    kill $PID
    rm ansuz.pid
    echo "Ansuz Tools 已停止"
else
    echo "进程不存在，清理 PID 文件..."
    rm ansuz.pid
fi
