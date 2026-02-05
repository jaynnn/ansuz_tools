# ansuz_tools
一个个性化工具库

## 功能特性

1. **账号系统** - 完整的用户注册、登录功能，使用 JWT 进行身份认证，密码使用 bcrypt 加密存储
2. **工具管理** - 以卡片形式展示工具列表，支持添加、删除工具
3. **标签筛选** - 为工具添加标签，支持按标签筛选显示
4. **主题切换** - 支持白天/夜晚模式切换
5. **用户设置** - 支持修改昵称、管理工具列表

## 技术栈

### 后端
- Node.js + Express
- TypeScript
- SQLite 数据库
- JWT 身份认证
- bcrypt 密码加密

### 前端
- React 18
- TypeScript
- React Router
- Axios
- CSS Variables (主题切换)

## 快速开始

### 环境要求
- Node.js 16+ 
- npm 或 yarn

### 后端设置

1. 进入后端目录：
```bash
cd backend
```

2. 安装依赖：
```bash
npm install
```

3. 配置环境变量：
复制 `.env.example` 到 `.env` 并设置您的配置：
```bash
cp .env.example .env
```

编辑 `.env` 文件，设置一个安全的 JWT 密钥：
```
PORT=3000
JWT_SECRET=your-secure-random-string-here
DATABASE_PATH=./database.sqlite
```

**重要**: 在生产环境中，请使用强随机字符串作为 JWT_SECRET。

4. 启动开发服务器：
```bash
npm run dev
```

后端服务将在 http://localhost:3000 启动

### 前端设置

1. 进入前端目录：
```bash
cd frontend
```

2. 安装依赖：
```bash
npm install
```

3. 启动开发服务器：
```bash
npm run dev
```

前端应用将在 http://localhost:5173 启动

## 项目结构

```
ansuz_tools/
├── backend/
│   ├── src/
│   │   ├── routes/       # API 路由
│   │   ├── middleware/   # 中间件
│   │   ├── utils/        # 工具函数
│   │   └── index.ts      # 入口文件
│   ├── package.json
│   └── tsconfig.json
└── frontend/
    ├── src/
    │   ├── components/   # React 组件
    │   ├── pages/        # 页面组件
    │   ├── contexts/     # Context 提供者
    │   ├── types/        # TypeScript 类型
    │   ├── api/          # API 调用
    │   └── styles/       # CSS 样式
    ├── package.json
    └── vite.config.ts
```

## 使用说明

1. 首次使用需要注册账号
2. 登录后进入主界面
3. 点击右上角的设置按钮可以：
   - 修改昵称
   - 添加新工具
4. 点击夜晚/白天图标切换主题
5. 使用标签筛选工具
6. 点击工具卡片上的"打开工具"按钮访问对应的 URL

## 安全说明

- 密码使用 bcrypt 加密存储（10 轮加盐）
- JWT token 用于会话管理，有效期 7 天
- 所有工具相关的 API 都需要身份验证
- JWT_SECRET 必须在环境变量中设置，否则服务器将拒绝启动

## 技术实现细节

### 数据库
使用 SQLite 作为数据库，包含两个主要表：
- `users`: 存储用户信息（用户名、加密密码、昵称）
- `tools`: 存储工具信息（名称、描述、标签、URL，关联到用户）

### API 端点
- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录
- `GET /api/auth/me` - 获取当前用户信息
- `PUT /api/auth/nickname` - 更新昵称
- `GET /api/tools` - 获取所有工具
- `POST /api/tools` - 创建工具
- `PUT /api/tools/:id` - 更新工具
- `DELETE /api/tools/:id` - 删除工具

## 生产环境部署

### Linux 一键部署

我们提供了一键部署脚本，可以快速在 Linux 服务器上部署应用：

```bash
# 1. 克隆仓库
git clone https://github.com/jaynnn/ansuz_tools.git
cd ansuz_tools

# 2. 运行部署脚本
chmod +x deploy.sh
./deploy.sh
```

部署脚本会自动完成以下操作：
- 检查系统依赖（Node.js >= 16）
- 生成安全的 JWT_SECRET 并创建 `.env` 文件
- 安装前后端依赖
- 构建前后端代码
- 创建启动和停止脚本

### 启动服务

部署完成后，可以使用以下方式启动服务：

**方式 1: 前台运行（推荐用于测试）**
```bash
./start.sh
```

**方式 2: 后台运行（推荐用于生产环境）**
```bash
./start-daemon.sh
```

**停止后台服务**
```bash
./stop.sh
```

### 访问应用

- **本地访问**：http://localhost:3000
- **局域网访问**：http://\<服务器IP\>:3000
- **公网访问**：需要配置防火墙允许 3000 端口访问

### 生产环境建议

1. **进程管理**：使用 PM2 或 systemd 管理服务进程
2. **反向代理**：配置 Nginx 作为反向代理
3. **HTTPS**：启用 HTTPS（推荐使用 Let's Encrypt）
4. **数据备份**：定期备份 `backend/database.sqlite` 数据库文件
5. **安全性**：
   - 确保 `backend/.env` 中的 JWT_SECRET 安全保密
   - 配置防火墙规则
   - 使用强密码
6. **监控**：设置应用监控和日志收集

### 使用 PM2 管理（可选）

如果想使用 PM2 管理进程，可以按以下步骤操作：

```bash
# 安装 PM2
npm install -g pm2

# 启动应用
cd backend
pm2 start dist/index.js --name ansuz_tools

# 设置开机自启
pm2 startup
pm2 save

# 查看状态
pm2 status

# 查看日志
pm2 logs ansuz_tools

# 停止应用
pm2 stop ansuz_tools
```

### 使用 Nginx 反向代理（可选）

Nginx 配置示例：

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

