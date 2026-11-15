# Build and release

The public project is ventsdenye2/fangjing-voxel-studio. Application source is distributed under MIT. Third-party software and source models retain their own terms.

## Local development

Use Node.js 22 and npm. Install the locked dependency set with npm ci, then run npm test and npm run build. Start the desktop development window with npm run desktop:dev. Start the built application with npm run desktop.

Build the Windows x64 portable executable on Windows with npm run pack:win. Build the macOS Apple Silicon DMG on macOS with npm run pack:mac. Installers are written to release. Signing credentials are currently unconfigured. The macOS package is unsigned and has not yet been verified on a physical Mac.

## Continuous integration

.github/workflows/ci.yml runs npm ci, npm test and npm run build for pull requests and pushes to main. Tests exercise binvox process boundaries with a fake child process. CI requires no binvox installation. Real local binary smoke results are recorded in DESKTOP.md.

## GitHub Releases

Push a version tag such as v0.1.0-alpha.1 to run .github/workflows/release.yml. The workflow checks out that tag, installs locked dependencies and runs tests on Windows and macOS. It applies the tag's version to the package metadata, then builds a Windows x64 portable EXE and a macOS arm64 DMG with electron-builder publishing disabled.

The publish job runs after both builds succeed. It collects the two installer artifacts, creates a draft release if needed, uploads assets using GITHUB_TOKEN and publishes the release. Rerunning the workflow replaces same-named assets. Tags containing a hyphen are marked as prereleases, including v0.1.0-alpha.1. Stable tags such as v1.0.0 produce regular releases. A manual rerun must select an existing version tag.

The build jobs have read-only repository permission. Only the final publish job receives contents write permission. No personal access token is required for the release workflow.

## Package contents

The electron-builder file allowlist includes dist, desktop and package.json together with required runtime dependencies. Private source models are excluded. Each platform bundle includes its own unmodified binvox binary and the full redistribution license and notices from resources/binvox. Windows includes win32-x64 and macOS includes darwin-x64. The macOS Electron app is arm64 while its bundled binvox helper is x86_64 and requires Rosetta 2. The release upload patterns select only portable EXE and DMG files. Review source and asset licensing before adding new files to the application bundle.

## Packaged window security review

The current host opens the packaged dist/index.html through file URLs. It uses sandboxing and context isolation, disables Node integration and webviews, denies new windows, blocks page navigation and rejects IPC from child frames. The request filter restricts file resources to the packaged dist directory and allows blob/data resources used for generated previews. Development additionally permits its configured loopback HTTP and matching WebSocket host.

The current implementation does not register a custom application protocol. Its packaged file URL behavior still requires a launched packaged-app acceptance check. macOS signing, notarization and real-machine runtime acceptance remain unverified.

The first alpha.1 release attempt could not schedule macos-14 because that runner was retired. Alpha.2 uses macos-15. Local Windows builds can reuse an installed runtime with npx electron-builder --win portable --x64 --publish never -c.electronDist=node_modules/electron/dist when the download cache is unavailable.

## v0.1.0 Windows 安装版

Windows 改为 NSIS 按用户安装，不再产出 portable。使用 npm run pack:win，发布需同时上传 Fangjing-Setup-<version>-x64.exe、对应 .blockmap 和 latest.yml。electron-updater 从本仓库 GitHub Releases 获取版本和 SHA-512 校验信息。不要只上传 EXE，也不要修改元数据中的文件名。

正式标签 v0.1.0 的发布工作流仅生成 Windows 安装包；Mac 保持 alpha.8 的独立预发布。Mac 自动安装更新需要签名及配套更新包，当前只提供新版检查与手动下载。构建安装包不等于验证跨版本安装；每次发布应检查实际安装、文件关联及更新行为。
