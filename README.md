# 久坐提醒应用

一个支持后台推送通知的智能久坐提醒应用，使用 PWA 技术实现跨平台支持。

## 功能特性

- ⏰ **智能提醒**：自定义提醒间隔（1-180分钟）
- 📱 **PWA 支持**：可安装到主屏幕，支持后台运行
- 🔔 **推送通知**：支持 iPhone 和 Android 后台推送
- 🎨 **现代 UI**：美观的渐变设计和流畅动画
- ☁️ **云端同步**：支持 Supabase 和 Instant DB 两种后端
- 🔄 **实时更新**：支持多设备同步提醒

## 项目结构

```
久坐通知/
├── index.html              # 简单版（纯前端）
├── pwa/                    # PWA 版本（Supabase 后端）
│   ├── index.html          # PWA 主页面
│   ├── manifest.json       # PWA 配置文件
│   └── sw.js              # Service Worker
├── instantdb/              # PWA 版本（Instant DB 后端）
│   ├── index.html          # PWA 主页面
│   ├── manifest.json       # PWA 配置文件
│   ├── sw.js              # Service Worker
│   └── package.json        # 项目配置
├── supabase-setup.sql      # Supabase 数据库初始化脚本
├── supabase-edge-function.js # Supabase Edge Function 代码
├── instantdb-setup.md      # Instant DB 配置指南
└── README.md              # 使用说明
```

## 快速开始

### 方案 A：简单版（纯前端）

1. 直接打开 `index.html` 文件
2. 允许浏览器通知权限
3. 设置提醒间隔并开始计时

**适用场景**：
- Mac/Windows 桌面浏览器
- 不需要后台推送
- 快速体验

### 方案 B：PWA + Supabase

#### 1. 设置 Supabase 项目

1. 访问 [Supabase](https://supabase.com) 创建新项目
2. 在 SQL Editor 中运行 `supabase-setup.sql` 脚本
3. 获取项目 URL 和 API Key

#### 2. 配置 PWA

1. 编辑 `pwa/index.html`，替换以下配置：

```javascript
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
```

2. 生成 VAPID 密钥（用于推送通知）：

```bash
npx web-push generate-vapid-keys
```

3. 将公钥替换到 `pwa/index.html` 中：

```javascript
applicationServerKey: urlBase64ToUint8Array('YOUR_VAPID_PUBLIC_KEY')
```

#### 3. 部署前端

将 `pwa/` 目录部署到任何静态网站托管服务。

### 方案 C：PWA + Instant DB（推荐）

#### 1. 设置 Instant DB 项目

1. 访问 [Instant DB](https://instantdb.com) 创建新项目
2. 按照 `instantdb-setup.md` 指南配置数据库 Schema
3. 获取 App ID 和 API Key

#### 2. 配置 PWA

1. 编辑 `instantdb/index.html`，替换以下配置：

```javascript
const APP_ID = 'your_instant_db_app_id';
const API_KEY = 'your_instant_db_api_key';
```

2. 生成 VAPID 密钥：

```bash
npx web-push generate-vapid-keys
```

3. 将公钥替换到代码中

#### 3. 部署前端

将 `instantdb/` 目录部署到任何静态网站托管服务：

- Vercel
- Netlify
- GitHub Pages
- 或任何支持 HTTPS 的服务器

## iPhone 使用说明

### 安装 PWA

1. 用 Safari 打开应用网址
2. 点击分享按钮
3. 选择"添加到主屏幕"
4. 在主屏幕打开应用

### 启用通知

1. 打开应用，点击"开始并订阅通知"
2. 允许通知权限
3. 设置提醒间隔
4. 应用会在后台运行并按时推送通知

**注意**：
- 需要 iOS 16.4+ 版本
- 必须通过"添加到主屏幕"安装才能接收后台推送
- 在 Safari 中直接使用无法接收后台推送

## Android 使用说明

1. 用 Chrome 打开应用
2. 点击地址栏的安装提示
3. 或通过菜单选择"添加到主屏幕"
4. 允许通知权限即可使用

## 技术架构

### 前端技术

- **PWA**：Progressive Web App 技术
- **Service Worker**：后台任务和推送处理
- **Web Push API**：浏览器推送通知
- **Supabase Client**：实时数据库和认证

### 后端技术

- **Supabase**：后端即服务（BaaS）
- **PostgreSQL**：关系型数据库
- **Edge Functions**：无服务器函数
- **Web Push**：推送通知服务

### 数据表结构

#### push_subscriptions
存储用户的推送订阅信息

#### reminders
存储提醒任务和状态

#### user_settings
存储用户偏好设置

## 环境变量

在 Supabase 项目设置中配置：

```
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
FCM_SERVER_KEY=your_fcm_server_key
VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
```

## 开发指南

### 本地开发

1. 克隆项目
2. 配置 Supabase 连接
3. 使用本地服务器运行：

```bash
# 使用 Python
python -m http.server 8000

# 使用 Node.js
npx serve .

# 使用 PHP
php -S localhost:8000
```

4. 访问 `http://localhost:8000/pwa/`

### 调试技巧

1. **Service Worker 调试**：
   - Chrome DevTools → Application → Service Workers
   - 查看注册状态和错误日志

2. **推送通知调试**：
   - Chrome DevTools → Application → Push Messaging
   - 测试推送订阅和通知

3. **PWA 调试**：
   - Chrome DevTools → Lighthouse
   - 检查 PWA 合规性

## 常见问题

### Q: iPhone 收不到后台推送？
A: 确保：
- iOS 版本 ≥ 16.4
- 通过"添加到主屏幕"安装
- 已授予通知权限
- 应用在后台运行

### Q: 如何修改提醒间隔？
A: 在应用界面输入新的分钟数，点击"重新设置"

### Q: 如何停止提醒？
A: 刷新页面或关闭应用即可停止当前提醒

### Q: 支持多设备同步吗？
A: 是的，所有设备使用同一个 Supabase 数据库，提醒会同步

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！

## 更新日志

### v1.0.0
- 初始版本发布
- 支持 PWA 和后台推送
- 集成 Supabase 后端
- 支持 iPhone 和 Android
