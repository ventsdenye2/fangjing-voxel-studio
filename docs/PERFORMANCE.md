# 性能调度与测试方法

## 当前调度

视口的 MeshWorkerClient 以资源对象引用缓存几何体。多个场景节点共享同一资源的几何体与材质。更换场景后调用 release，移除视口后调用 dispose。

后台池按浏览器报告的逻辑核心数选择并发度，公式为 min(2, max(1, hardwareConcurrency - 2))。浏览器缺少核心数信息时使用两个 worker。不同资源的轻量建网格任务可以同时占用两个 worker。单个资源的贪心建网格在一个 worker 中运行。

以下任务进入独占队列，等待已经开始的任务结束后单独运行。

- 任一网格维度达到 256。
- 占用体素超过 200,000 个。计数到达阈值即结束扫描，分类结果按资源引用缓存。
- binvox 输入超过 1 MiB。

队列按进入顺序调度。独占任务到达队首后等待在途任务结束，后续任务排队。worker 空闲两秒后终止，已完成的几何体缓存继续保留。cancelAll 终止在途任务并清空待执行队列。release 会取消对应资源的排队或在途建网格任务。

调度器的小型测试覆盖双 worker 上限、低核心数串行、重资源独占、大输入解析独占、空闲回收、缓存共享和取消后重启。2026-11-11 的定向测试通过 8 项。完整自动化测试与合成 CPU 基准已运行；持续交互帧率与峰值内存尚未测完。

## 可复现的合成负载

脚本 scripts/benchmarks.mjs 在显式调用时生成资源与项目文件。

| 负载 | 独立资源 | 节点 | 定义 |
| --- | --- | --- | --- |
| repeated-200 | 4 | 200 | 每类演示资源 50 个实例，20×10 阵列，中心间距 4，实例缩放 0.4 |
| distinct-noisy-50 | 50 | 50 | 每项使用 32³ 网格、独立种子、扰动空心壳与四种随机颜色，10×5 阵列，中心间距 4 |

两组数据通过程序合成，项目 sources 为空。所有数据保存在本地，原始项目 JSON 可独立检查。随机种子、项目 ID 与项目时间固定。

输出位于 artifacts/performance，包含每组的 .json 原始项目、.vxlproj 编辑器工程、.results.json 统计和 latest-run.json 运行环境记录。脚本逐组执行并结束进程。

先完成一条命令，再执行下一条。

~~~text
node --expose-gc scripts/benchmarks.mjs --case=repeated
node --expose-gc scripts/benchmarks.mjs --case=distinct
~~~

仅生成项目供浏览器测量时执行以下命令。

~~~text
node scripts/benchmarks.mjs --case=repeated --fixtures-only
node scripts/benchmarks.mjs --case=distinct --fixtures-only
~~~

2026-11-11 已串行运行两组基准。200 实例：27,200 个场景三角面，共享几何缓冲约 57 KiB；50 独立噪声资产：429,854 个三角面，几何缓冲约 44.3 MiB。Node RSS 末次快照分别约 68.3 / 168.8 MiB，它们不是 Electron 总内存或峰值。

同日 Windows Electron 窗口已实际打开这两组工程；重复实例当前视角 18,542 三角面 / 142 次绘制，独立资产聚焦全部后 429,854 三角面 / 51 次绘制。静止均显示按需渲染。截图见 desktop-noisy-50.png。这验证加载与显示，不代表持续交互 FPS 或真实美术复杂场景的性能承诺。系统进程指标读取失败，未取得可靠 Electron 峰值内存；持续旋转帧时和操作延迟仍待测。

## CPU 统计口径

每项资源记录占用体素数、原始外露面数、贪心合并四边形数、三角形数和几何属性缓冲区字节数。

- greedyMeshingMs 单独测量贪心合并。
- geometryBuildMs 测量完整几何体生成，包含其内部贪心合并。
- sceneAssemblyMs 使用预建几何体组装节点，体现共享资源后的场景组装开销。
- uniqueGeometryTriangles 按独立资源累计。
- sceneTriangles 按全部可见节点累计，浏览器的视锥裁剪与多渲染通道会改变实际提交量。
- memoryBefore、memoryAfter 为 Node 进程内存快照，覆盖 JS 堆、外部缓冲区与 RSS。maxObservedHeapBytes 是各采样点的最大堆值。

带 --expose-gc 运行时，在每组几何处理前执行一次 GC。各项诊断耗时独立记录。浏览器 worker 的结构化复制、GPU 上传和绘制耗时由浏览器验收补充。

## 浏览器验收记录

逐个打开合成 .vxlproj，等待网格任务完成，固定窗口尺寸、设备像素比与相机视角。分别记录静止观察、持续旋转和选择节点时的 FPS、帧时分布、renderer.info.render.triangles、draw calls、几何体缓存数量与加载耗时。同时记录显卡、分辨率、逻辑核心数及浏览器版本。

同一资源实例负载和独立噪声资源负载分别测量。每组结束后关闭视口并确认空闲 worker 回收，再加载下一组。
