# 架构与数据约定

## 组件

React 编辑器只管理可序列化 Project；Three.js 构建可视网格和交互控件。Electron 主进程通过固定 IPC 提供文件选择、设置、BINVOX 转换与导出保存。界面无 Node 权限，binvox 以参数数组启动，不经过 shell。

## 数据

Project schemaVersion=1，包含 assets、nodes、sources。VoxelAsset 保存原点、体素边长、三维尺寸和稀疏坐标到 sRGB hex 颜色。SceneNode 使用稳定 id、parentId、assetId、局部位置/角度/缩放及标签。源文件编码保存在工程包中，跨电脑重开不依赖绝对路径。

坐标为 Y-up，1单位=1米。BINVOX 数据顺序 y fastest、z、x；转换保留 header translate/scale。工程 ZIP 的扩展名为 .vxlproj。源模型重新转换创建新资产版本；复制实例与创建独立资产是两个不同操作。

## 输出

GLB 是交换模型。天工包是面向0.4.19的作者源，通过官方资产烘焙、catalog 和 GUID 加载。玩法逻辑应留在宿主游戏组合层，避免美术重新导出覆盖。出生点和触发区域是标记数据，不自动添加游戏行为。

## 性能与错误

512网格本身有134217728个位置，因此解析采用RLE预检和稀疏存储；当前占用体素预算200万，外露面预算160万。高档位复杂模型可能被拒绝，给出降档提示。颜色采样分时让出主线程并支持取消。工程和二进制均校验尺寸与内容，不信任上传路径。
