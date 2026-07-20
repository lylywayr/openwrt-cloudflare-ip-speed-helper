# Changelog

## v0.2.3

- Add optional edgetunnel ADD.txt sync after each successful speed test run.
- Sync replaces the remote ADD.txt with the latest local cache result, so stale IPs are removed.
- Add LuCI and UCI options for edgetunnel URL, password, IPv4 count, and IPv6 count.
- Keep edgetunnel sync disabled by default and do not store any panel password in the repository.

## v0.2.2

- 新增离线整包安装产物，内置 `cfst`
- 安装脚本新增离线整包识别逻辑，可优先使用本地文件安装
- README / README.en 新增“如何选择安装方式”与架构选择说明
- 离线安装不再要求用户单独手装 `cfst`

## v0.2.1

- 默认配置不再内置私人测速地址，`test_url` 默认为空
- 当 `test_url` 留空时，自动回退到官方 `https://speed.cloudflare.com/__down?bytes=10485760`
- 新增详细文档：`docs/self-hosted-speed-url.md`
- 修复优选完成后代理未恢复的问题
- 代理恢复逻辑增强：`start` 失败后自动补 `restart`
- README / README.en 重新整理为干净 UTF-8 文档

## v0.2.0

- 首个公开发布版本
- 包含 `cf-ip-speed-client`
- 包含 `luci-app-cf-ip-speed-client` LuCI 面板
- 支持 `IPv4` / `IPv6` / 双栈优选
- 支持多端口优选、缓存管理、手动补种、实时日志
- 支持停止代理后执行优选
- 提供一键安装脚本与通用 `all` 架构 `.ipk` 打包脚本
