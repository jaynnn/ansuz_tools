# ansuz_tools
一个个性化工具库

---

## 开发规范

> 本部分定义了 ansuz_tools 项目的开发规范和约束，所有开发者在对本项目执行任何指令前必须阅读并遵守以下规范。

### 1. 工具代码隔离原则

**要求**：新增任何工具时，都要保证工具代码之间清晰隔离。

#### 实施细则：
- 每个新增的工具模块应独立放置在单独的文件或目录中
- 工具之间的依赖关系应通过明确的接口定义
- 避免工具模块之间的循环依赖
- 使用依赖注入模式降低模块间的耦合度
- 后端工具放置在 `backend/src/utils/` 目录下，每个工具一个文件
- 前端组件放置在 `frontend/src/components/` 目录下，遵循单一职责原则

#### 示例：
```
✓ 正确：backend/src/utils/emailService.ts
✓ 正确：backend/src/utils/fileUpload.ts
✗ 错误：backend/src/utils/混合各种功能的utils.ts
```

### 2. 配置管理规范

**要求**：所有模型参数、API密钥、第三方服务密钥必须通过配置文件或环境变量管理，严禁硬编码。

#### 实施细则：
- 所有敏感信息必须存储在 `.env` 文件中，不得提交到版本控制系统
- 项目根目录和各子项目目录应提供 `.env.example` 文件作为配置模板
- 配置信息通过 `process.env` 访问
- 使用 `dotenv` 库加载环境变量
- 所有第三方 API 密钥、数据库连接字符串、JWT 密钥等必须配置化

#### 禁止的做法：
```typescript
// ✗ 错误 - 硬编码
const API_KEY = "sk-1234567890abcdef";
const JWT_SECRET = "my-secret-key";

// ✓ 正确 - 使用环境变量
const API_KEY = process.env.API_KEY;
const JWT_SECRET = process.env.JWT_SECRET;
```

#### 必需的环境变量：
- `JWT_SECRET`: JWT 令牌签名密钥
- `PORT`: 服务端口
- `DATABASE_PATH`: 数据库文件路径
- 其他第三方服务的 API 密钥和配置参数

### 3. 外部化配置和依赖管理

**要求**：外部化配置，明确依赖关系。

#### 实施细则：
- 使用 `package.json` 明确声明所有项目依赖
- 依赖版本应使用精确版本号或兼容版本号（避免使用 `*` 或 `latest`）
- 配置文件应分层管理：开发环境、测试环境、生产环境
- 数据库连接、服务端点等外部依赖应通过配置注入
- 使用 TypeScript 接口定义配置对象的类型

#### 依赖管理原则：
- 定期审查和更新依赖包，修复已知安全漏洞
- 避免引入功能重复的依赖包
- 优先使用维护活跃、社区支持好的依赖包
- 记录依赖变更的原因（通过 commit message）

### 4. 最小权限原则和访问隔离

**要求**：最小权限原则和访问隔离。

#### 实施细则：
- API 路由应实施适当的身份认证和授权检查
- 用户只能访问和修改自己的数据
- 使用中间件进行统一的权限检查
- 数据库操作应使用参数化查询，防止 SQL 注入
- 文件系统操作应限制在指定目录内
- 敏感操作（如删除用户、修改配置）应有额外的权限验证

#### 访问控制实现：
```typescript
// 使用认证中间件保护路由
router.get('/api/tools', authenticateToken, getUserTools);
router.delete('/api/tools/:id', authenticateToken, deleteUserTool);

// 确保用户只能操作自己的数据
const tool = await db.get('SELECT * FROM tools WHERE id = ? AND user_id = ?', [toolId, userId]);
```

### 5. 系统运行状态透明化和可追溯

**要求**：系统运行状态透明化和可追溯。

#### 实施细则：
- 实现统一的日志记录机制
- 日志应包含时间戳、日志级别、操作类型、用户标识等信息
- 记录关键操作（登录、数据修改、错误等）
- 使用结构化日志格式（JSON）便于分析
- 错误应包含足够的上下文信息便于调试
- 生产环境应配置日志轮转，避免日志文件过大

#### 日志级别：
- `ERROR`: 错误信息，需要立即关注
- `WARN`: 警告信息，可能存在问题
- `INFO`: 一般信息，记录关键操作
- `DEBUG`: 调试信息，仅在开发环境使用

#### 日志示例：
```typescript
logger.info({
  action: 'user_login',
  userId: user.id,
  timestamp: new Date().toISOString(),
  ip: req.ip
});

logger.error({
  action: 'database_error',
  error: error.message,
  stack: error.stack,
  timestamp: new Date().toISOString()
});
```

### 6. 异步化和资源优化

**要求**：异步化，避免阻塞，充分利用资源。

#### 实施细则：
- 所有 I/O 操作（数据库、文件系统、网络请求）必须使用异步方式
- 使用 `async/await` 语法处理异步操作
- 避免在请求处理中使用同步阻塞操作
- 对于耗时操作，考虑使用后台任务队列
- 数据库查询应使用连接池
- 实现适当的超时机制，防止请求无限等待

#### 异步编程最佳实践：
```typescript
// ✓ 正确 - 使用 async/await
async function getTools(userId: number) {
  const tools = await db.all('SELECT * FROM tools WHERE user_id = ?', [userId]);
  return tools;
}

// ✗ 错误 - 使用同步操作
function getToolsSync(userId: number) {
  const data = fs.readFileSync('tools.json'); // 阻塞操作
  return JSON.parse(data);
}

// ✓ 正确 - 并行执行多个异步操作
const [tools, user, stats] = await Promise.all([
  getTools(userId),
  getUser(userId),
  getStats(userId)
]);
```

### 7. 测试和模拟环境支持

**要求**：支持单元测试、集成测试和模拟环境。

#### 实施细则：
- 代码应编写为可测试的结构（依赖注入、接口抽象）
- 每个功能模块应有对应的单元测试
- 关键业务流程应有集成测试覆盖
- 使用 Mock 对象模拟外部依赖（数据库、API、文件系统）
- 测试环境应使用独立的配置和数据
- 测试代码应放置在 `__tests__` 或 `*.test.ts` 文件中

#### 测试框架建议：
- 单元测试：Jest / Vitest
- 集成测试：Supertest (API 测试)
- E2E 测试：Playwright / Cypress

#### 测试覆盖目标：
- 核心业务逻辑：> 80%
- 工具函数：> 90%
- API 端点：主要流程 100%

#### 测试结构示例：
```typescript
// tools.test.ts
describe('Tool Management', () => {
  beforeEach(async () => {
    // 设置测试数据库
    await setupTestDatabase();
  });

  afterEach(async () => {
    // 清理测试数据
    await cleanupTestDatabase();
  });

  it('should create a new tool', async () => {
    const tool = await createTool(mockToolData);
    expect(tool.id).toBeDefined();
    expect(tool.name).toBe(mockToolData.name);
  });

  it('should reject unauthorized access', async () => {
    const response = await request(app)
      .get('/api/tools')
      .expect(401);
  });
});
```

### 规范执行

#### 代码审查检查清单：
- [ ] 新增工具代码是否清晰隔离？
- [ ] 是否存在硬编码的密钥或配置？
- [ ] 依赖关系是否明确声明？
- [ ] 是否实施了适当的权限检查？
- [ ] 关键操作是否有日志记录？
- [ ] I/O 操作是否使用异步方式？
- [ ] 是否编写了相应的测试？

#### 违规处理：
违反本规范的代码提交应被拒绝，直到问题得到修复。团队成员应相互监督，确保规范得到严格执行。

---

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
PORT=4000
JWT_SECRET=your-secure-random-string-here
DATABASE_PATH=./database.sqlite
```

**重要**: 在生产环境中，请使用强随机字符串作为 JWT_SECRET。

4. 启动开发服务器：
```bash
npm run dev
```

后端服务将在 http://localhost:4000 启动

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
- 使用 Helmet 设置安全 HTTP 响应头
- 所有用户输入经过 HTML 标签过滤和长度限制，防止 XSS 攻击
- 所有数据库操作使用参数化查询，防止 SQL 注入
- 请求体大小限制为 1MB，防止 DoS 攻击
- CORS 可通过环境变量 `CORS_ORIGIN` 配置允许的来源域名

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

- **本地访问**：http://localhost:4000
- **局域网访问**：http://\<服务器IP\>:4000
- **公网访问**：需要配置防火墙允许 4000 端口访问

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

### 一键更新（推荐）

项目提供了基于 PM2 的一键更新脚本，支持零停机平滑更新：

```bash
# 运行一键更新脚本
chmod +x update.sh
./update.sh
```

更新脚本会自动完成以下操作：
- 从远程仓库拉取最新代码
- 安装前后端依赖
- 编译构建前后端代码
- 使用 PM2 平滑重启（零停机）

首次运行会自动安装 PM2 并创建 `.env` 文件。后续更新只需重复执行 `./update.sh`。

### 使用 PM2 管理（推荐）

项目自带 `ecosystem.config.js` 配置文件，可直接使用 PM2：

```bash
# 安装 PM2（如果尚未安装）
npm install -g pm2

# 启动应用
pm2 start ecosystem.config.js

# 设置开机自启
pm2 startup
pm2 save

# 查看状态
pm2 status

# 查看日志
pm2 logs ansuz_tools

# 平滑重启（零停机）
pm2 reload ecosystem.config.js

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
        proxy_pass http://localhost:4000;
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

