# 目标

将久坐通知收敛为 Electron 桌面版“每日有效休息目标”应用：固定间隔提醒、前台休息弹窗、离开电脑才累计有效休息、电脑活动重置本次休息、今日目标完成后当天停止提醒。

# 已完成

- 通过 `hui1` 恢复 2026-05-21 到 2026-05-22 的同项目 conversation。
- 已确认不启动子代理。
- 已记录 `P-2026-1539`：`package.json` test 脚本指向不存在的状态机测试文件。
- 已清理旧 Web/PWA/云同步/权限目录和旧通知/持续打字检测兼容入口。
- 已确认源码只保留 Electron 桌面主路径：`main.js`、`preload.js`、`index.html`、`rest.html`、`main/reminderState.js`、`main/restWindow.js`。
- 已通过 `npm test`，状态机 5 条回归测试通过。
- 已通过 `node --check` 语法检查。
- 已确认生产依赖 `npm audit --omit=dev` 为 0 漏洞。
- 已通过 `CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:mac -- --dir`，确认无签名目录构建可完成。
- 已通过 `DEBUG=electron-builder npm run build:mac -- --dir`，确认默认 `Developer ID Application` 签名目录构建可完成；签名阶段较慢但未卡死。
- 已通过 `codesign --verify --deep --strict --verbose=2 dist/mac-arm64/久坐提醒.app`，签名产物满足 Designated Requirement。
- 已通过隔离 Electron 实例验收：保存最短参数、开始提醒、测试休息弹窗进入 `prompt`。
- 已通过隔离 Electron 实例验收：休息弹窗的“稍后提醒”和“跳过本次”回到工作态，“开始休息”进入 `resting`。
- 已通过隔离 Electron 实例验收：1 分钟休息块完成后进入 `completed`，主窗口显示 `1 / 1 分钟` 且测试休息弹窗入口禁用。

# 下一步

确认是否记录 macOS 公证/发布链缺口，再决定是补公证发布链、处理依赖升级，还是按当前状态收尾。

# 阻塞项

- 当前 `dist/mac-arm64/久坐提醒.app` 已签名，但 `xcrun stapler validate` 显示没有 notarization ticket；仓库里也没有签名/公证脚本或 release workflow。
- 默认数据目录的项目 Electron 进程仍在运行；本轮隔离验收实例已停止。
