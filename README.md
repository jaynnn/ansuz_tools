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

