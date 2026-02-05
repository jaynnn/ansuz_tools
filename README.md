# ansuz_tools
一个个性化工具库 - 使用 TypeScript 开发的全栈工具管理应用

## 功能特点

### 1. 账号系统
- ✅ 用户注册/登录
- ✅ 密码加密存储 (bcrypt)
- ✅ JWT 令牌认证
- ✅ 会话管理

### 2. 工具管理
- ✅ 工具以卡片形式展示
- ✅ 支持添加/删除工具
- ✅ 每个工具包含：名称、描述、图标、标签
- ✅ 标签筛选功能

### 3. 界面功能
- ✅ 夜间/白天模式切换
- ✅ 设置页面（修改昵称）
- ✅ 响应式设计

## 技术栈

### 后端
- Node.js + Express
- TypeScript
- MongoDB + Mongoose
- JWT 认证
- bcryptjs 密码加密

### 前端
- React 18
- TypeScript
- React Router
- Axios
- Vite

## 快速开始

### 方式一：使用 Docker Compose（推荐）

这是最简单的方式，会自动启动所有服务：

```bash
docker-compose up
```

访问应用：
- 前端: http://localhost:5173
- 后端 API: http://localhost:5000

### 方式二：手动安装运行

### 前置要求
- Node.js (v16+)
- MongoDB

### 安装

1. 克隆项目
```bash
git clone <repository-url>
cd ansuz_tools
```

2. 安装后端依赖
```bash
cd backend
npm install
cp .env.example .env
# 编辑 .env 文件，配置数据库和 JWT 密钥
```

3. 安装前端依赖
```bash
cd ../frontend
npm install
cp .env.example .env
# 如需修改后端 API 地址，编辑 .env 文件
```

### 运行

1. 启动 MongoDB
```bash
mongod
```

2. 启动后端服务器
```bash
cd backend
npm run dev
# 服务器将在 http://localhost:5000 运行
```

3. 启动前端应用
```bash
cd frontend
npm run dev
# 应用将在 http://localhost:5173 运行
```

## 项目结构

```
ansuz_tools/
├── backend/              # 后端服务
│   ├── src/
│   │   ├── config/      # 配置文件（数据库等）
│   │   ├── controllers/ # 控制器
│   │   ├── middleware/  # 中间件（认证等）
│   │   ├── models/      # 数据模型
│   │   ├── routes/      # 路由
│   │   └── index.ts     # 入口文件
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/            # 前端应用
│   ├── src/
│   │   ├── components/  # React 组件
│   │   ├── contexts/    # React Context (认证、主题)
│   │   ├── pages/       # 页面组件
│   │   ├── services/    # API 服务
│   │   ├── types/       # TypeScript 类型定义
│   │   ├── App.tsx      # 应用主组件
│   │   └── main.tsx     # 入口文件
│   ├── package.json
│   └── tsconfig.json
│
└── README.md
```

## API 端点

### 认证
- POST `/api/auth/register` - 用户注册
- POST `/api/auth/login` - 用户登录
- GET `/api/auth/profile` - 获取用户信息
- PUT `/api/auth/profile` - 更新用户信息

### 工具管理
- GET `/api/tools` - 获取所有工具
- POST `/api/tools` - 创建新工具
- PUT `/api/tools/:id` - 更新工具
- DELETE `/api/tools/:id` - 删除工具

## 安全特性

- 密码使用 bcrypt 加密（10 轮盐值）
- JWT 令牌认证，7 天有效期
- 所有工具操作需要身份验证
- 用户只能访问和修改自己的工具

## 开发

### 后端开发
```bash
cd backend
npm run dev  # 使用 nodemon 自动重启
```

### 前端开发
```bash
cd frontend
npm run dev  # 使用 Vite 热模块替换
```

### 构建生产版本

后端：
```bash
cd backend
npm run build
npm start
```

前端：
```bash
cd frontend
npm run build
# 生成的文件在 dist/ 目录
```

## 许可证

ISC
