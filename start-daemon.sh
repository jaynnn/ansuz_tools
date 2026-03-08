#!/bin/bash

# 以 PM2 守护进程方式启动 Ansuz Tools
# 仅启动 ansuz_tools 进程，不影响机器上其他 PM2 进程

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# 检查 PM2 是否安装，如果未安装则自动安装
if ! command -v pm2 >/dev/null 2>&1; then
    echo "PM2 未安装，正在自动安装..."
    npm install -g pm2 || exit 1
    echo "✓ PM2 安装完成"
fi

# 检查是否已经在运行
if pm2 describe ansuz_tools >/dev/null 2>&1; then
    echo "Ansuz Tools 已经在运行（通过 PM2 管理）"
    pm2 status ansuz_tools
    exit 0
fi

# 检查并安装后端依赖
if [ ! -d "backend/node_modules" ]; then
    echo "正在安装后端依赖..."
    cd "$SCRIPT_DIR/backend"
    npm install --production=false || exit 1
    cd "$SCRIPT_DIR"
fi

# 构建后端代码
if [ ! -d "backend/dist" ]; then
    echo "正在构建后端代码..."
    cd "$SCRIPT_DIR/backend"
    npm run build || exit 1
    cd "$SCRIPT_DIR"
fi

# 确保 .env 文件存在
if [ ! -f "backend/.env" ]; then
    echo "创建 backend/.env 文件..."
    JWT_SECRET=$(openssl rand -base64 32)
    cat > backend/.env << EOF
PORT=4000
JWT_SECRET=$JWT_SECRET
DATABASE_PATH=./database.sqlite
EOF
    echo "✓ 已生成安全的 JWT_SECRET 并创建 .env 文件"
fi

# 通过 PM2 启动（仅启动 ansuz_tools，不影响其他进程）
echo "正在以 PM2 守护进程方式启动 Ansuz Tools..."
pm2 start ecosystem.config.js --only ansuz_tools
pm2 save

echo ""
echo "Ansuz Tools 已启动（PM2 守护进程）"
pm2 status ansuz_tools
echo ""
echo "查看日志: pm2 logs ansuz_tools"
echo "停止服务: ./stop.sh"
