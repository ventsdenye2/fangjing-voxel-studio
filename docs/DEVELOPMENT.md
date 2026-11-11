# 开发与验收记录

更新：2026-11-11。首版为 Alpha，不将功能实现等同于完整验收。

## 需求与交付

面向美术的 Windows x64 / macOS Apple Silicon 桌面工具。支持 GLB、OBJ/MTL/贴图，binvox 32/64/128/256/512 五档，体素增删与涂色、关卡摆放、可编辑工程包与天工 0.4.19 导出。原创源码 MIT，第三方 binvox 按原许可独立分发。

## 已取得证据

- 自动化测试 42 项通过，TypeScript/Vite 构建通过，GitHub CI 通过。
- Windows binvox 1.39 简单立方体五档均转换成功；256 档为 390,152 体素，512 档为 1,566,728 体素。此项是转换器测试，不代表每档完整 UI 链路验收。
- Windows Electron 离线加载构建页面，内置 binvox 就绪；OBJ 64 档 UI 转换得到 23,816 体素，模型表面正常显示。
- 保存 .vxlproj 后重新打开，源模型与体素保留。
- 单个 Electron 窗口分别载入 200 个重复实例、50 个不同噪声资产，后者聚焦全部后显示 429,854 三角面 / 51 次绘制。静止视口按需渲染，详见 [性能记录](PERFORMANCE.md)。
- 实际编辑器导出 ZIP 已通过天工 0.4.19 build/cook、资产 ready 检查与运行时显示。独立副本使用独立 mesh，位置正确；颜色数据正确但该副本在截图中被房屋遮挡，见 [天工验证](TIANGONG.md)。
- binvox 原许可允许按条件再分发未修改二进制。包内附完整许可。

## 首版限制与剩余验收

- Windows portable 与 Mac DMG 通过 GitHub Actions 构建发布；Alpha.1 的 macos-14 runner 已退役，Alpha.2 改用 macos-15。构建状态以 Releases / Actions 为准。
- macOS 尚未真机运行、签名或公证；Apple Silicon 内置 binvox 为 x86_64，需要 Rosetta 2。
- 大量真实复杂美术资产、持续交互帧率、操作延迟与 Electron 峰值内存尚未完成系统测量。不能从合成场景正常显示推断任何复杂地图都流畅。
- 小中型关卡优先；尚无分区加载、LOD、天工反向同步。
- 首版内存与面数预算可能要求复杂模型降档；源模型颜色采样不等同于保留完整 PBR 材质。

## 资源与开源边界

用户曾反馈测试后台过多导致卡顿。已清理预览页面与天工验证服务；后续转换、性能测试和打包串行，轻量代码任务适当并行。工具内部最多两个轻量 Worker，大资产独占队列，空闲 Worker 两秒后回收。

公开内容不含私人美术模型、SDK、凭据、操作历史与缓存。测试关卡和立方体均为程序生成夹具。

## Alpha.3 启动修复

Alpha.2 Windows portable 启动时出现 ERR_BLOCKED_BY_CLIENT：临时目录短用户名含 ~，Node file URL 编码为 %7E，而 Chromium 请求保留 ~，字符串前缀比较误拦截。Alpha.3 使用 fileURLToPath 解码后检查目录包含关系，继续阻止目录穿越与目录外请求。新增四项回归测试通过，涵盖短路径编码、Windows 大小写、目录穿越、Mac 空格与中文路径。Alpha.2 不应作为可用 Windows 版本分发。

Alpha.3 本地 portable EXE 已实际启动验证：解压到含 ~ 的 Windows 短用户名临时目录，app.asar/dist/index.html 成功加载，示例关卡显示、资源 Worker 正常，设置面板显示 binvox is ready。截图 portable-alpha3-verified.png。
