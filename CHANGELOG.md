# Changelog

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
