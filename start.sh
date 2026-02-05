#!/bin/bash

# 启动 Ansuz Tools 服务

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/backend"

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

# 启动后端服务
echo "正在启动 Ansuz Tools..."
npm start
