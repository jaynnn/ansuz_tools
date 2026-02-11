#!/bin/bash

# Ansuz Tools 一键更新脚本（基于 PM2 零停机更新）
# 用法: ./update.sh
# 功能: 拉取最新代码 → 安装依赖 → 编译构建 → PM2 平滑重启

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_message() {
    echo -e "${2}${1}${NC}"
}

print_header() {
    echo ""
    echo "======================================"
    print_message "$1" "$BLUE"
    echo "======================================"
    echo ""
}

check_command() {
    if ! command -v "$1" >/dev/null 2>&1; then
        print_message "错误: $1 未安装，请先安装 $1" "$RED"
        exit 1
    fi
}

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

print_header "Ansuz Tools 一键更新"

# 检查依赖
check_command node
check_command npm
check_command git

# 检查 PM2 是否安装，如果未安装则自动安装
if ! command -v pm2 >/dev/null 2>&1; then
    print_message "PM2 未安装，正在自动安装..." "$YELLOW"
    npm install -g pm2
    print_message "✓ PM2 安装完成" "$GREEN"
fi

# 步骤 1: 拉取最新代码
print_header "步骤 1: 拉取最新代码"
print_message "正在从远程仓库拉取更新..." "$YELLOW"
git pull --rebase || {
    print_message "代码拉取失败，请手动处理冲突后重试" "$RED"
    exit 1
}
print_message "✓ 代码已更新到最新版本" "$GREEN"

# 步骤 2: 安装后端依赖
print_header "步骤 2: 安装后端依赖"
cd "$SCRIPT_DIR/backend"
print_message "正在安装后端依赖..." "$YELLOW"
npm install --production=false
print_message "✓ 后端依赖安装完成" "$GREEN"

# 步骤 3: 构建后端
print_header "步骤 3: 构建后端"
print_message "正在编译 TypeScript..." "$YELLOW"
npm run build
print_message "✓ 后端构建完成" "$GREEN"

# 步骤 4: 安装前端依赖
print_header "步骤 4: 安装前端依赖"
cd "$SCRIPT_DIR/frontend"
print_message "正在安装前端依赖..." "$YELLOW"
npm install
print_message "✓ 前端依赖安装完成" "$GREEN"

# 步骤 5: 构建前端
print_header "步骤 5: 构建前端"
print_message "正在构建前端生产版本..." "$YELLOW"
npm run build
print_message "✓ 前端构建完成" "$GREEN"

# 步骤 6: PM2 平滑重启
print_header "步骤 6: 平滑重启服务"
cd "$SCRIPT_DIR"

# 检查 PM2 是否已有该应用在运行
if pm2 describe ansuz_tools >/dev/null 2>&1; then
    print_message "检测到服务正在运行，正在平滑重启..." "$YELLOW"
    pm2 reload ecosystem.config.js
    print_message "✓ 服务已平滑重启（零停机）" "$GREEN"
else
    print_message "首次启动服务..." "$YELLOW"
    # 确保 .env 文件存在
    if [ ! -f "backend/.env" ]; then
        print_message "创建 backend/.env 文件..." "$YELLOW"
        JWT_SECRET=$(openssl rand -base64 32)
        cat > backend/.env << EOF
PORT=4000
JWT_SECRET=$JWT_SECRET
DATABASE_PATH=./database.sqlite
EOF
        print_message "✓ 已生成安全的 JWT_SECRET 并创建 .env 文件" "$GREEN"
    fi
    pm2 start ecosystem.config.js
    pm2 save
    print_message "✓ 服务已启动" "$GREEN"
fi

# 完成
print_header "更新完成！"

pm2 status ansuz_tools

echo ""
print_message "常用 PM2 命令：" "$BLUE"
echo "  pm2 status          - 查看服务状态"
echo "  pm2 logs ansuz_tools - 查看实时日志"
echo "  pm2 restart ansuz_tools - 重启服务"
echo "  pm2 stop ansuz_tools    - 停止服务"
echo ""
