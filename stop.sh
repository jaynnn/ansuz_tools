#!/bin/bash

# 停止 Ansuz Tools 服务（通过 PM2，仅停止 ansuz_tools，不影响其他进程）

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v pm2 >/dev/null 2>&1; then
    echo "错误: PM2 未安装，无法停止服务"
    exit 1
fi

if pm2 describe ansuz_tools >/dev/null 2>&1; then
    echo "正在停止 Ansuz Tools..."
    pm2 stop ansuz_tools
    echo "Ansuz Tools 已停止"
else
    echo "Ansuz Tools 未运行"
fi
