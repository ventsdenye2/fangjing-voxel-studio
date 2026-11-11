# 开发记录

更新：2026-11-11。此文档保存当前工程的事实、验证和下一步，不能把已实现等同于已验收。

## 已确认需求

- 面向美术的跨平台桌面工具：Windows x64、macOS Apple Silicon。
- 输入 GLB、OBJ/MTL/贴图；binvox 32/64/128/256/512 五档。
- 基础颜色采样、体素增删涂色、关卡摆放、小中型场景。
- 可编辑工程包、通用 GLB、天工 0.4.19 原生资产交付。
- 仓库 ventsdenye2/fangjing-voxel-studio，公开，原创源码 MIT；用户已授权创建并发布 Release。
- binvox 许可允许时随包分发，不允许的平台提供简单引导。

## 已实现，待整体验证

- src/core：BINVOX 解析、外露面网格、模型导入与贴图颜色采样、工程 ZIP、GLB 导出。
- src/App.tsx 与 components/Viewport.tsx：三栏界面、关卡和模型模式、项目操作。
- desktop：Electron 隔离桥接、binvox 子进程、取消/超时、保存对话框。
- forgeax-export：天工 0.4.19 Pack 作者源和稳定 GUID/sourceKey。

## 已取得证据

- Windows binvox 1.39 简单立方体 32/64/128/256/512 全部转换成功。
- 256：390152 occupied cells；512：1566728 occupied cells。这是转换测试，不等于编辑器全链路通过。
- 0.4.19 原生 Pack build、cook、asset inspect 和 asset verify 已通过隔离 fixture；单方块夹具运行时与视觉验证通过，父子位移已核对；完整编辑器导出场景仍在验证。
- binvox -license 明确允许附完整版权和条件的未修改二进制再分发，不允许售卖 binvox 本体；第三方资源打包处理中。

## 当前待办

1. npm 安装完成，首轮 24 项单元测试通过；高分辨率合并面优化和新增测试进行中。
2. 核验视口交互、模型导入、五档转换、保存重开、导出与取消。
3. 完成天工运行时加载/视觉证据。
4. 准备 Windows 包并实机运行；Mac 通过 CI 构建但实机未验证需明确标注。
5. 整理许可/第三方 notices、文档、发布前隐私检查。
6. GitHub 公开仓库已创建；开发文档先行提交，源码整体验证后推送并发布预发布版。

## 开发边界

- 不改现有游戏布局或根插件；隔离天工验证目录不进入开源源码。
- 不提交本机路径、凭据、现有美术素材、node_modules、SDK、副本缓存和个人日志。
- 任何尚未运行的平台和场景明确写未验证。
