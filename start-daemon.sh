#!/bin/bash

# 以守护进程方式启动 Ansuz Tools

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/backend"

# 检查是否已经在运行
if [ -f "ansuz.pid" ]; then
    PID=$(cat ansuz.pid)
    if ps -p "$PID" > /dev/null 2>&1; then
        echo "Ansuz Tools 已经在运行 (PID: $PID)"
        exit 1
    fi
fi

# 检查并安装依赖
if [ ! -d "node_modules" ]; then
  echo "正在安装依赖..."
  npm install || exit 1
fi

# 构建后端代码
if [ ! -d "dist" ]; then
  echo "正在构建后端代码..."
  npm run build || exit 1
fi

# 启动后端服务（后台运行）
echo "正在启动 Ansuz Tools（后台模式）..."
nohup npm start > ../ansuz.log 2>&1 &
echo $! > ansuz.pid

echo "Ansuz Tools 已启动"
echo "PID: $(cat ansuz.pid)"
echo "日志文件: $SCRIPT_DIR/ansuz.log"
