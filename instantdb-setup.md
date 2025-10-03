# Instant DB 配置指南

## 什么是 Instant DB？

Instant DB 是一个实时数据库服务，专为现代 Web 应用设计。它提供了：

- 🔄 **实时同步**：数据变化立即同步到所有客户端
- 🚀 **简单易用**：无需复杂的后端代码
- 📱 **PWA 友好**：完美支持离线功能
- 💰 **免费额度**：提供慷慨的免费使用额度

## 快速开始

### 1. 创建 Instant DB 项目

1. 访问 [Instant DB](https://instantdb.com)
2. 点击 "Get Started" 创建账户
3. 创建新项目，命名为 "sit-reminder"
4. 获取你的 `App ID` 和 `API Key`

### 2. 配置数据库 Schema

在 Instant DB Dashboard 中，进入 "Schema" 页面，添加以下表结构：

```javascript
// 推送订阅表
push_subscriptions: {
  id: string (primary key)
  subscription: object
  user_agent: string
  created_at: string
}

// 提醒表
reminders: {
  id: string (primary key)
  minutes: number
  reminder_time: string
  title: string
  body: string
  status: string // 'scheduled', 'sent', 'cancelled'
  created_at: string
}

// 用户设置表
user_settings: {
  id: string (primary key)
  user_id: string
  default_interval: number
  is_active: boolean
  created_at: string
}
```

### 3. 配置应用

编辑 `instantdb/index.html` 文件，替换以下配置：

```javascript
// 替换为你的 Instant DB 配置
const APP_ID = 'your_instant_db_app_id';
const API_KEY = 'your_instant_db_api_key';
```

### 4. 生成 VAPID 密钥

```bash
npx web-push generate-vapid-keys
```

将公钥替换到代码中：

```javascript
applicationServerKey: urlBase64ToUint8Array('your_vapid_public_key')
```

## 部署步骤

### 1. 本地测试

```bash
# 进入项目目录
cd /Users/apple/久坐通知

# 启动本地服务器
npx serve instantdb -p 3000

# 访问 http://localhost:3000
```

### 2. 部署到生产环境

#### 选项 A：Vercel（推荐）

1. 安装 Vercel CLI：
```bash
npm i -g vercel
```

2. 部署：
```bash
cd instantdb
vercel --prod
```

#### 选项 B：Netlify

1. 将 `instantdb` 文件夹拖拽到 [Netlify Drop](https://app.netlify.com/drop)
2. 或连接 GitHub 仓库自动部署

#### 选项 C：GitHub Pages

1. 创建 GitHub 仓库
2. 上传 `instantdb` 文件夹内容
3. 在仓库设置中启用 GitHub Pages

## 功能特性

### 实时数据同步

- 所有设备实时同步提醒状态
- 多用户同时使用不会冲突
- 离线时数据自动缓存

### 推送通知

- 支持 iPhone 和 Android 后台推送
- 自定义通知内容和图标
- 点击通知可重新开始计时

### 数据持久化

- 提醒历史记录自动保存
- 用户设置跨设备同步
- 数据备份和恢复

## 高级配置

### 自定义推送服务

如果需要更强大的推送功能，可以集成：

1. **Firebase Cloud Messaging (FCM)**
2. **OneSignal**
3. **Pusher Beams**

### 用户认证

Instant DB 支持多种认证方式：

```javascript
// 匿名认证
const db = init({ appId, apiKey });

// 邮箱认证
const db = init({ appId, apiKey });
await db.auth.signIn({ email: 'user@example.com' });

// 社交登录
await db.auth.signIn({ provider: 'google' });
```

### 数据权限

在 Instant DB Dashboard 中配置数据访问权限：

```javascript
// 允许所有用户读写
reminders: {
  read: true,
  write: true
}

// 只允许认证用户访问
push_subscriptions: {
  read: "auth.id != null",
  write: "auth.id != null"
}
```

## 监控和分析

### 使用统计

Instant DB 提供详细的使用统计：

- 数据库查询次数
- 实时连接数
- 存储使用量
- API 调用次数

### 错误监控

```javascript
// 监听数据库错误
db.on('error', (error) => {
  console.error('数据库错误:', error);
});

// 监听连接状态
db.on('status', (status) => {
  console.log('连接状态:', status);
});
```

## 故障排除

### 常见问题

1. **连接失败**
   - 检查 App ID 和 API Key 是否正确
   - 确认网络连接正常
   - 查看浏览器控制台错误信息

2. **推送通知不工作**
   - 确认已授予通知权限
   - 检查 VAPID 密钥配置
   - 验证 Service Worker 注册成功

3. **数据不同步**
   - 检查网络连接
   - 确认 Instant DB 服务状态
   - 查看数据库权限设置

### 调试技巧

```javascript
// 启用调试模式
const db = init({ 
  appId, 
  apiKey,
  debug: true 
});

// 监听所有数据变化
db.subscribe({}, (data) => {
  console.log('数据变化:', data);
});
```

## 成本说明

### 免费额度

- 每月 100,000 次查询
- 1GB 存储空间
- 实时连接无限制
- 推送通知 1,000 次/月

### 付费计划

- 基础版：$9/月
- 专业版：$29/月
- 企业版：自定义价格

对于个人使用的久坐提醒应用，免费额度完全够用。

## 安全建议

1. **API Key 保护**
   - 不要在客户端代码中暴露敏感信息
   - 使用环境变量存储配置

2. **数据验证**
   - 在客户端验证用户输入
   - 设置合理的数据权限

3. **HTTPS 部署**
   - 确保生产环境使用 HTTPS
   - 配置正确的 CORS 策略

## 下一步

1. 配置 Instant DB 项目
2. 部署到生产环境
3. 测试推送通知功能
4. 根据需要调整配置

需要帮助配置 Instant DB 或部署应用吗？




