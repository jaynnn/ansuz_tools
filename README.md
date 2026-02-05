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

### 后端设置

```bash
cd backend
npm install
npm run dev
```

后端服务将在 http://localhost:3000 启动

### 前端设置

```bash
cd frontend
npm install
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

