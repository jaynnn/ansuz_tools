#!/bin/bash

# Ansuz Tools 一键部署脚本
# 适用于 Linux 系统

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
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

# 检查命令是否存在
check_command() {
    if ! command -v "$1" >/dev/null 2>&1; then
        print_message "错误: $1 未安装，请先安装 $1" "$RED"
        exit 1
    fi
}

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

print_header "Ansuz Tools 部署脚本"

# 检查必要的依赖
print_message "检查系统依赖..." "$YELLOW"
check_command node
check_command npm

# 显示 Node.js 版本
NODE_VERSION=$(node -v)
print_message "✓ Node.js 版本: $NODE_VERSION" "$GREEN"

# 检查 Node.js 版本是否满足要求 (>= 16)
NODE_MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
if [ "$NODE_MAJOR_VERSION" -lt 16 ]; then
    print_message "错误: Node.js 版本必须 >= 16，当前版本为 $NODE_VERSION" "$RED"
    exit 1
fi

# 步骤 1: 设置后端环境变量
print_header "步骤 1: 配置后端环境变量"

if [ ! -f "backend/.env" ]; then
    print_message "创建 backend/.env 文件..." "$YELLOW"
    
    # 生成安全的 JWT_SECRET
    JWT_SECRET=$(openssl rand -base64 32)
    
    cat > backend/.env << EOF
PORT=4000
JWT_SECRET=$JWT_SECRET
DATABASE_PATH=./database.sqlite
EOF
    
    print_message "✓ 已生成安全的 JWT_SECRET 并创建 .env 文件" "$GREEN"
else
    print_message "✓ backend/.env 文件已存在，跳过创建" "$GREEN"
fi

# 步骤 2: 安装后端依赖
print_header "步骤 2: 安装后端依赖"
cd backend
print_message "正在安装后端依赖，请稍候..." "$YELLOW"
npm install
print_message "✓ 后端依赖安装完成" "$GREEN"

# 步骤 3: 构建后端
print_header "步骤 3: 构建后端"
print_message "正在编译 TypeScript..." "$YELLOW"
npm run build
print_message "✓ 后端构建完成" "$GREEN"
cd ..

# 步骤 4: 安装前端依赖
print_header "步骤 4: 安装前端依赖"
cd frontend
print_message "正在安装前端依赖，请稍候..." "$YELLOW"
npm install
print_message "✓ 前端依赖安装完成" "$GREEN"

# 步骤 5: 构建前端
print_header "步骤 5: 构建前端"
print_message "正在构建前端生产版本..." "$YELLOW"
npm run build
print_message "✓ 前端构建完成" "$GREEN"
cd ..

# 步骤 6: 配置后端服务前端静态文件
print_header "步骤 6: 配置静态文件服务"

# 检查 backend/src/index.ts 是否已配置静态文件服务
if grep -q "express.static" backend/src/index.ts 2>/dev/null && grep -q "frontend.*dist" backend/src/index.ts 2>/dev/null; then
    print_message "✓ 静态文件服务已配置" "$GREEN"
else
    print_message "需要手动配置后端服务前端静态文件" "$YELLOW"
    print_message "请在 backend/src/index.ts 中添加以下代码：" "$YELLOW"
    echo ""
    echo "  app.use(express.static(path.join(__dirname, '../../frontend/dist')));"
    echo ""
    print_message "注意：这一步需要手动完成" "$RED"
fi

# 步骤 7: 创建启动脚本
print_header "步骤 7: 创建启动脚本"

cat > start.sh << 'EOF'
#!/bin/bash

# 启动 Ansuz Tools 服务

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/backend"

# 启动后端服务
echo "正在启动 Ansuz Tools..."
npm start
EOF

chmod +x start.sh
print_message "✓ 启动脚本创建完成" "$GREEN"

# 步骤 8: 创建后台运行脚本
print_header "步骤 8: 创建后台运行脚本"

cat > start-daemon.sh << 'EOF'
#!/bin/bash

# 以守护进程方式启动 Ansuz Tools

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/backend"

# 检查是否已经在运行
if [ -f "ansuz.pid" ]; then
    PID=$(cat ansuz.pid)
    if ps -p "$PID" > /dev/null 2>&1; then
        echo "Ansuz Tools 已经在运行 (PID: $PID)"
        exit 1
    fi
fi

# 启动后端服务（后台运行）
echo "正在启动 Ansuz Tools（后台模式）..."
nohup npm start > ../ansuz.log 2>&1 &
echo $! > ansuz.pid

echo "Ansuz Tools 已启动"
echo "PID: $(cat ansuz.pid)"
echo "日志文件: $SCRIPT_DIR/ansuz.log"
EOF

chmod +x start-daemon.sh
print_message "✓ 后台运行脚本创建完成" "$GREEN"

# 步骤 9: 创建停止脚本
cat > stop.sh << 'EOF'
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
if ps -p "$PID" > /dev/null 2>&1; then
    echo "正在停止 Ansuz Tools (PID: $PID)..."
    kill $PID
    rm ansuz.pid
    echo "Ansuz Tools 已停止"
else
    echo "进程不存在，清理 PID 文件..."
    rm ansuz.pid
fi
EOF

chmod +x stop.sh
print_message "✓ 停止脚本创建完成" "$GREEN"

# 完成
print_header "部署完成！"

print_message "=== 如何启动服务 ===" "$BLUE"
echo ""
print_message "方式 1: 前台运行（推荐用于测试）" "$YELLOW"
echo "  ./start.sh"
echo ""
print_message "方式 2: 后台运行（推荐用于生产环境）" "$YELLOW"
echo "  ./start-daemon.sh"
echo ""
print_message "停止后台服务：" "$YELLOW"
echo "  ./stop.sh"
echo ""

print_message "=== 如何访问 ===" "$BLUE"
echo ""

# 获取本机 IP
IP_ADDRESS=$(hostname -I | awk '{print $1}')
if [ -z "$IP_ADDRESS" ]; then
    IP_ADDRESS="<服务器IP>"
fi

print_message "本地访问：" "$GREEN"
echo "  http://localhost:4000"
echo ""
print_message "局域网访问：" "$GREEN"
echo "  http://${IP_ADDRESS}:4000"
echo ""
print_message "公网访问：" "$GREEN"
echo "  需要配置防火墙允许 4000 端口访问"
echo "  http://<公网IP>:4000"
echo ""

print_message "=== 生产环境建议 ===" "$YELLOW"
echo ""
echo "1. 使用 PM2 或 systemd 管理服务进程"
echo "2. 配置 Nginx 反向代理（参考项目根目录的 nginx.conf 模板）"
echo "3. 启用 HTTPS (推荐使用 Let's Encrypt)"
echo "4. 定期备份 backend/database.sqlite 数据库"
echo "5. 修改默认端口或配置防火墙规则"
echo ""
print_message "=== Nginx 配置注意事项 ===" "$YELLOW"
echo ""
echo "配置 Nginx 时，请确保 HTTP 和 HTTPS 两个 server 块均包含："
echo "  client_max_body_size 20m;"
echo "否则音频上传功能（智谱 AI 分析）将返回 413 错误。"
echo "详见项目根目录的 nginx.conf 模板和 README.md。"
echo ""

print_message "=== 重要提示 ===" "$RED"
echo ""
echo "1. 请确保 backend/.env 中的 JWT_SECRET 安全保密"
echo "2. 首次访问需要注册账号"
echo "3. 数据库文件位于 backend/database.sqlite"
echo ""

print_message "部署脚本执行完成！" "$GREEN"
