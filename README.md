# 方境 · Voxel Studio

面向美术的本地体素资产与关卡编辑器。Windows / macOS 共用一套 Electron + React + Three.js 源码。

> 开发中，首次发布将使用预发布版本。完成情况与实际验证记录见 [开发记录](docs/DEVELOPMENT.md)。

## 工作流

导入 GLB 或 OBJ + MTL + 贴图 → binvox 转换 → 体素增删、涂色 → 关卡摆放 → 保存可编辑工程 → 导出天工 0.4.19。

- 转换分辨率：32、64、128、256、512。
- 场景操作：选择、多选、移动、旋转、等比缩放、复制、分组、隐藏、锁定、网格吸附。
- 工程包含源模型、体素颜色和独立场景节点；天工导出保留层级与稳定身份。
- 体素修整在本工具中完成；天工内可继续关卡布局和玩法开发，暂不支持反向同步。
- 高分辨率有显式内存预算。超出预算会提示降低分辨率；512 不是任意复杂模型都能无条件载入。

## 开发

需要 Node.js 22、npm。

```sh
npm ci
npm run desktop:dev
npm test
npm run build
```

网页版 `npm run dev` 支持编辑、项目和场景导出；调用本地 binvox 使用桌面版。

## 文档

- [开发状态与任务记录](docs/DEVELOPMENT.md)
- [架构与数据约定](docs/ARCHITECTURE.md)
- [天工导入](docs/TIANGONG.md)
- [桌面转换服务](docs/DESKTOP.md)
- [打包与发布](docs/BUILD.md)

## 开源与第三方

原创源码使用 MIT。binvox 是独立第三方程序，不受本仓库 MIT 许可覆盖；按其自带许可单独分发并附完整声明。示例关卡由程序生成，不包含现有美术项目素材。天工 SDK 不随本仓库或安装包分发。
