# Ansuz Tools - API 文档

## 基础信息

**Base URL:** `http://localhost:5000/api`

**内容类型:** `application/json`

**认证方式:** JWT Bearer Token

## 认证 API

### 1. 用户注册

**端点:** `POST /auth/register`

**描述:** 创建新用户账号

**请求头:**
```
Content-Type: application/json
```

**请求体:**
```json
{
  "username": "string",    // 必填，最少3个字符，唯一
  "password": "string",    // 必填，最少6个字符
  "nickname": "string"     // 可选，默认使用用户名
}
```

**成功响应:** `201 Created`
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "username": "john_doe",
    "nickname": "John Doe"
  }
}
```

**错误响应:**

- `400 Bad Request` - 用户名已存在
```json
{
  "message": "User already exists"
}
```

- `500 Internal Server Error` - 服务器错误
```json
{
  "message": "Server error",
  "error": {...}
}
```

---

### 2. 用户登录

**端点:** `POST /auth/login`

**描述:** 用户登录获取令牌

**请求头:**
```
Content-Type: application/json
```

**请求体:**
```json
{
  "username": "string",    // 必填
  "password": "string"     // 必填
}
```

**成功响应:** `200 OK`
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "username": "john_doe",
    "nickname": "John Doe"
  }
}
```

**错误响应:**

- `400 Bad Request` - 凭据无效
```json
{
  "message": "Invalid credentials"
}
```

---

### 3. 获取用户信息

**端点:** `GET /auth/profile`

**描述:** 获取当前登录用户的信息

**请求头:**
```
Authorization: Bearer <token>
```

**成功响应:** `200 OK`
```json
{
  "id": "507f1f77bcf86cd799439011",
  "username": "john_doe",
  "nickname": "John Doe"
}
```

**错误响应:**

- `401 Unauthorized` - 未提供令牌或令牌无效
```json
{
  "message": "No authentication token, access denied"
}
```

- `404 Not Found` - 用户不存在
```json
{
  "message": "User not found"
}
```

---

### 4. 更新用户信息

**端点:** `PUT /auth/profile`

**描述:** 更新当前用户的信息

**请求头:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**请求体:**
```json
{
  "nickname": "string"    // 必填
}
```

**成功响应:** `200 OK`
```json
{
  "id": "507f1f77bcf86cd799439011",
  "username": "john_doe",
  "nickname": "New Nickname"
}
```

**错误响应:**

- `401 Unauthorized` - 未授权
- `404 Not Found` - 用户不存在

---

## 工具 API

所有工具 API 端点都需要认证。

### 5. 获取工具列表

**端点:** `GET /tools`

**描述:** 获取当前用户的所有工具

**请求头:**
```
Authorization: Bearer <token>
```

**成功响应:** `200 OK`
```json
[
  {
    "_id": "507f1f77bcf86cd799439011",
    "name": "时间戳转换器",
    "description": "Unix 时间戳与日期时间相互转换",
    "tags": ["开发", "时间", "转换"],
    "icon": "⏰",
    "userId": "507f191e810c19729de860ea",
    "createdAt": "2024-01-15T10:30:00.000Z"
  },
  {
    "_id": "507f1f77bcf86cd799439012",
    "name": "JSON 格式化",
    "description": "JSON 数据格式化和验证工具",
    "tags": ["开发", "JSON", "格式化"],
    "icon": "📋",
    "userId": "507f191e810c19729de860ea",
    "createdAt": "2024-01-15T11:00:00.000Z"
  }
]
```

**错误响应:**

- `401 Unauthorized` - 未授权
- `500 Internal Server Error` - 服务器错误

---

### 6. 创建工具

**端点:** `POST /tools`

**描述:** 创建新工具

**请求头:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**请求体:**
```json
{
  "name": "string",           // 必填
  "description": "string",    // 必填
  "tags": ["string"],         // 可选，默认空数组
  "icon": "string"           // 可选，默认 "🛠️"
}
```

**成功响应:** `201 Created`
```json
{
  "_id": "507f1f77bcf86cd799439011",
  "name": "时间戳转换器",
  "description": "Unix 时间戳与日期时间相互转换",
  "tags": ["开发", "时间", "转换"],
  "icon": "⏰",
  "userId": "507f191e810c19729de860ea",
  "createdAt": "2024-01-15T10:30:00.000Z"
}
```

**错误响应:**

- `401 Unauthorized` - 未授权
- `500 Internal Server Error` - 服务器错误

---

### 7. 更新工具

**端点:** `PUT /tools/:id`

**描述:** 更新指定工具

**请求头:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**路径参数:**
- `id`: 工具的 ID

**请求体:**
```json
{
  "name": "string",           // 可选
  "description": "string",    // 可选
  "tags": ["string"],         // 可选
  "icon": "string"           // 可选
}
```

**成功响应:** `200 OK`
```json
{
  "_id": "507f1f77bcf86cd799439011",
  "name": "时间戳转换器（更新）",
  "description": "Unix 时间戳与日期时间相互转换",
  "tags": ["开发", "时间", "转换", "实用"],
  "icon": "⏰",
  "userId": "507f191e810c19729de860ea",
  "createdAt": "2024-01-15T10:30:00.000Z"
}
```

**错误响应:**

- `401 Unauthorized` - 未授权
- `404 Not Found` - 工具不存在或不属于当前用户
```json
{
  "message": "Tool not found"
}
```

---

### 8. 删除工具

**端点:** `DELETE /tools/:id`

**描述:** 删除指定工具

**请求头:**
```
Authorization: Bearer <token>
```

**路径参数:**
- `id`: 工具的 ID

**成功响应:** `200 OK`
```json
{
  "message": "Tool deleted successfully"
}
```

**错误响应:**

- `401 Unauthorized` - 未授权
- `404 Not Found` - 工具不存在或不属于当前用户
```json
{
  "message": "Tool not found"
}
```

---

## 健康检查

### 9. 服务器健康检查

**端点:** `GET /health`

**描述:** 检查服务器是否正常运行

**请求头:** 无需认证

**成功响应:** `200 OK`
```json
{
  "status": "ok",
  "message": "Server is running"
}
```

---

## 通用错误响应

### 401 Unauthorized

未授权访问，令牌缺失或无效

```json
{
  "message": "No authentication token, access denied"
}
```

或

```json
{
  "message": "Token is not valid"
}
```

### 500 Internal Server Error

服务器内部错误

```json
{
  "message": "Server error",
  "error": {...}
}
```

---

## 使用示例

### 使用 cURL

**注册用户:**
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john_doe",
    "password": "password123",
    "nickname": "John Doe"
  }'
```

**登录:**
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john_doe",
    "password": "password123"
  }'
```

**获取工具列表:**
```bash
curl -X GET http://localhost:5000/api/tools \
  -H "Authorization: Bearer <your-token>"
```

**创建工具:**
```bash
curl -X POST http://localhost:5000/api/tools \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "时间戳转换器",
    "description": "Unix 时间戳与日期时间相互转换",
    "tags": ["开发", "时间", "转换"],
    "icon": "⏰"
  }'
```

### 使用 JavaScript (Axios)

**注册并登录:**
```javascript
import axios from 'axios';

const API_BASE = 'http://localhost:5000/api';

// 注册
const register = async () => {
  const response = await axios.post(`${API_BASE}/auth/register`, {
    username: 'john_doe',
    password: 'password123',
    nickname: 'John Doe'
  });
  
  const { token, user } = response.data;
  localStorage.setItem('token', token);
  return user;
};

// 登录
const login = async () => {
  const response = await axios.post(`${API_BASE}/auth/login`, {
    username: 'john_doe',
    password: 'password123'
  });
  
  const { token, user } = response.data;
  localStorage.setItem('token', token);
  return user;
};

// 获取工具列表
const getTools = async () => {
  const token = localStorage.getItem('token');
  const response = await axios.get(`${API_BASE}/tools`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  
  return response.data;
};

// 创建工具
const createTool = async (toolData) => {
  const token = localStorage.getItem('token');
  const response = await axios.post(`${API_BASE}/tools`, toolData, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  
  return response.data;
};
```

---

## 注意事项

1. **令牌有效期:** JWT 令牌有效期为 7 天
2. **数据隔离:** 用户只能访问自己创建的工具
3. **CORS:** 后端已配置 CORS，允许跨域请求
4. **速率限制:** 当前版本未实现速率限制（生产环境建议添加）
5. **HTTPS:** 生产环境应使用 HTTPS
