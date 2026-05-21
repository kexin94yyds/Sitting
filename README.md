# 久坐提醒

一个 Electron 桌面应用，用固定间隔提醒你站起来休息，并按“有效离开电脑时间”累计每日目标。

## 核心规则

- 设置多久提醒一次，例如每 45 分钟。
- 设置每次有效休息时长，例如连续离开电脑 5 分钟。
- 设置每日有效休息目标，例如每天累计 30 分钟。
- 到点后直接弹出前台休息窗口。
- 点击“开始休息”后，只有键盘和鼠标持续空闲达到判定秒数，才开始累计本次有效休息。
- 休息期间一旦动键盘或鼠标，本次有效休息计时会重置。
- 完成一次有效休息后计入今日目标，并自动进入下一轮工作计时。
- 今日目标完成后当天停止提醒，次日重新计算。

## 项目结构

```txt
久坐通知/
├── main.js                    # Electron 主进程、窗口、托盘、IPC、运行时 tick
├── preload.js                 # 安全暴露给页面的 Electron API
├── index.html                 # 主设置窗口
├── rest.html                  # 到点前台休息窗口
├── main/
│   ├── reminderState.js       # 纯状态机：工作、提醒、休息、每日目标
│   └── restWindow.js          # 前台休息窗口管理
├── tests/
│   └── reminderState.test.js  # 状态机回归测试
├── package.json
└── README.md
```

## 本地运行

```bash
npm install
npm run electron
```

开发态可使用：

```bash
npm run electron:dev
```

## 测试

```bash
npm test
```

当前测试覆盖：

- 启动计时后按间隔进入提醒。
- 稍后提醒和跳过本次会回到工作计时。
- 休息必须离开电脑后才累计。
- 休息期间电脑活动会重置本次有效休息。
- 完成有效休息会累计今日目标。
- 今日目标完成后进入 completed，次日重置为 idle。

## 打包

```bash
npm run build:mac
npm run build:win
```

产物输出到 `dist/`。`dist/` 是构建产物，不作为源码维护。

## 技术说明

- 桌面壳：Electron 28
- 配置和运行态存储：electron-store
- 空闲判定：Electron `powerMonitor.getSystemIdleTime()`
- 状态机：`main/reminderState.js`

本项目已经收敛为桌面应用，不再维护 PWA、Supabase、InstantDB、Web Push、uiohook 或 Accessibility 权限链路。
