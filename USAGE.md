# Ansuz Tools - 使用指南

## 使用 Docker Compose 运行（推荐）

这是最简单的运行方式，会自动启动 MongoDB、后端和前端服务。

1. 确保已安装 Docker 和 Docker Compose

2. 运行以下命令：
```bash
docker-compose up
```

3. 访问应用：
   - 前端: http://localhost:5173
   - 后端 API: http://localhost:5000

4. 停止服务：
```bash
docker-compose down
```

## 手动运行

### 1. 安装 MongoDB

如果系统未安装 MongoDB，请先安装：

**Ubuntu/Debian:**
```bash
sudo apt-get install mongodb
sudo systemctl start mongodb
```

**macOS:**
```bash
brew install mongodb-community
brew services start mongodb-community
```

**Windows:**
从 https://www.mongodb.com/try/download/community 下载并安装

### 2. 启动后端

```bash
cd backend
npm install
cp .env.example .env
# 编辑 .env 文件，配置数据库连接
npm run dev
```

后端服务将在 http://localhost:5000 运行

### 3. 启动前端

在新终端中：
```bash
cd frontend
npm install
cp .env.example .env
# 如需修改 API 地址，编辑 .env 文件
npm run dev
```

前端应用将在 http://localhost:5173 运行

## 使用应用

### 1. 注册账号
1. 打开 http://localhost:5173
2. 点击"注册"
3. 填写用户名、密码和昵称
4. 提交注册

### 2. 登录
1. 使用注册的用户名和密码登录
2. 登录成功后会自动跳转到主界面

### 3. 添加工具
1. 在主界面点击"+ 添加工具"按钮
2. 填写工具信息：
   - 图标：输入 emoji 表情
   - 名称：工具的名称
   - 描述：工具的功能描述
   - 标签：用逗号分隔的标签（如：开发,工具,效率）
3. 点击"添加"

### 4. 筛选工具
- 在主界面顶部可以看到所有标签
- 点击标签可以筛选显示带有该标签的工具
- 可以选择多个标签进行组合筛选
- 点击"清除筛选"恢复显示所有工具

### 5. 删除工具
- 在工具卡片右上角点击 ✕ 按钮
- 确认删除

### 6. 切换主题
- 点击顶部导航栏的 🌙/☀️ 图标
- 在深色和浅色主题之间切换

### 7. 修改昵称
1. 点击顶部导航栏的"⚙️ 设置"
2. 在设置页面修改昵称
3. 点击"保存更改"

### 8. 退出登录
- 点击顶部导航栏的"退出"按钮

## 示例工具

以下是一些工具示例，可以在添加工具时参考：

1. **时间戳转换器**
   - 图标：⏰
   - 描述：Unix 时间戳与日期时间相互转换
   - 标签：开发,时间,转换

2. **JSON 格式化**
   - 图标：📋
   - 描述：JSON 数据格式化和验证工具
   - 标签：开发,JSON,格式化

3. **Base64 编解码**
   - 图标：🔐
   - 描述：Base64 编码和解码工具
   - 标签：开发,编码,安全

4. **颜色选择器**
   - 图标：🎨
   - 描述：RGB、HEX、HSL 颜色值转换
   - 标签：设计,颜色,转换

5. **Markdown 编辑器**
   - 图标：📝
   - 描述：实时预览的 Markdown 编辑器
   - 标签：文档,编辑,Markdown

## 故障排查

### 后端无法启动
- 确保 MongoDB 正在运行
- 检查 .env 文件中的 MONGODB_URI 配置
- 查看端口 5000 是否被占用

### 前端无法连接后端
- 确保后端服务正在运行
- 检查 frontend/.env 文件中的 VITE_API_URL 配置
- 打开浏览器开发者工具查看网络请求

### 无法登录
- 确保后端服务正常运行
- 检查 JWT_SECRET 是否在 backend/.env 中配置
- 清除浏览器缓存和 localStorage

## 技术支持

如有问题，请查看：
- 后端日志：运行 `cd backend && npm run dev` 的终端输出
- 前端日志：浏览器开发者工具的控制台
- MongoDB 日志：MongoDB 的日志文件
