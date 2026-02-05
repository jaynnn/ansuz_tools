#!/bin/bash

# 启动 Ansuz Tools 服务

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/backend"

# 启动后端服务
echo "正在启动 Ansuz Tools..."
npm start
