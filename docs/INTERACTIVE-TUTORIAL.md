# 交互教程

在线地址：https://ventsdenye2.github.io/fangjing-voxel-studio/

教程直接渲染 src/App.tsx，复用桌面版的布局、图标、样式、Three.js 视口及工程导出逻辑。引导条放在编辑器外，蒙版只突出本步的真实控件。

网页无法执行本地 binvox，因此导入按钮载入程序生成的树 GLB，转换按钮使用预制树体素样例。分辨率选项用于认识真实入口，不改变此教学样例。该限制在页面上明确说明。用户上传的模型不参与教程转换。

涂色、增删体素、场景变换、保存 .vxlproj 和导出天工 Pack 均为真实编辑功能。练习工程可在桌面版打开。教程不读写普通编辑器的自动草稿；刷新页面会重新开始。

通过 npm run build:tutorial 构建，GitHub Actions 将 dist-tutorial 发布到 Pages。Windows 和 macOS 桌面版不加载教程适配器。
