# ForgeAX / 天工导出

导出 ZIP 包含 `assets/voxel-studio.pack.ts`、`voxel-studio.metadata.json` 和导入说明。将 pack 放入 ForgeAX 0.4.19 项目的 `assets/`，使用项目自己的资产验证和构建流程，使其经过 cooker 和 catalog；运行时通过 catalog GUID 加载 `scene/main`，再实例化场景。不要通过运行时 fetch 读取源文件。

同一项目 ID 固定对应 package ID，同一资产 ID 固定对应 `mesh/<ID 的 UTF-8 十六进制>` sourceKey；移动或重命名节点不改变资源身份。修改项目 ID 会创建新身份。多个场景节点可引用同一 mesh。位置、XYZ 欧拉角（度）、缩放、父子关系和名称写入场景；隐藏节点及其后代不绑定渲染组件。原始节点 ID、标签、锁定状态、spawn/trigger 类型保留在 metadata 中，宿主游戏需要自行读取并实现生成点、触发器和交互行为；导出不自动创建物理触发器。

空资产不会生成 mesh，颜色当前要求 `#rrggbb`。导出只包含体素数据，不执行导入模型中的代码。ZIP 不包含原始模型文件。修改项目后重新导出并让引擎重新 cook。导出包和宿主游戏的玩法、灯光与相机需要在目标项目中另行验证。

`scripts/verify-forgeax.mjs` 在 ForgeAX 项目的 `artifacts/voxel-import-validation` 创建隔离夹具并运行构建及检查，默认查找相邻的 `forgeax-game`，也可通过 `FORGEAX_PROJECT` 指定。使用本机 0.4.19 对一个彩色方块和父子节点夹具执行 `project build` 后，`asset inspect` 和 `asset verify` 确认 mesh、material、scene 已产出，场景引用正确。隔离运行时显示了红色方块；庭院示例也显示了小屋、树和地面，树的世界位置与父级旋转和平移相符。记录见 [forgeax-verification.json](forgeax-verification.json)，庭院画面见 [forgeax-courtyard-fixture.png](forgeax-courtyard-fixture.png)。

从编辑器实际下载的庭院 ZIP 也在独立的 0.4.19 项目中构建并运行。资产检查显示五个 mesh、一个 material 和一个 scene 均已就绪；复制石阶使用独立 mesh，运行时位置约为 `[1.3, 0, -1.7]`。导出几何中的副本含新增的薄荷色，原石阶不含该颜色。运行时画面见 [forgeax-editor-export.png](forgeax-editor-export.png)，但该方块在当前视角被房屋遮挡，尚未通过画面确认颜色。上述验证在 Windows 上完成；macOS 构建及真实 Mac 运行尚未验证。
