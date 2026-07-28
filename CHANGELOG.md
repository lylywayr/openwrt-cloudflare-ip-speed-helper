## 0.2.4-beta

- 多端口发布：生成汇总 `ADD.txt` 与每端口 `ADD-<port>.txt`。
- GitHub 与 Cloudflare Pages 独立部署，均已做端到端发布校验。
- Pages 使用 Wrangler 官方发布流程；需用户前端知情同意后创建最小权限 Pages Token，Token 不回显。
- 移除发行默认配置中的私人仓库、项目名与域名。

# Changelog

## v0.2.3-beta (2026-07-28)

### 修复
- cfst 标准版参数兼容：替换魔改版 `-custom-flow` 为标准 cfst v2.3.5 参数
- 多端口轮询：支持同时测多个端口（443, 8443, 2053, 2083）
- IPv6 检测：无默认路由时自动跳过
- BusyBox awk 兼容：修复 `printf "%d"` 语法错误

### 新增
- 格式转换：标准 cfst 输出 7 列自动转换为自定义 11 列格式
- 自动部署：优选完成后自动调用 `cf-ip-speed-deploy` 发布结果
- 前端即时保存：所有配置项修改后立即持久化
- 智能部署区域：部署地址实时计算展示，配置变更自动触发部署
- 速度阈值从 12.50 调整为 4.00 MB/s

### 安装

**在线安装（推荐）：**
```bash
curl -fsSL https://raw.githubusercontent.com/lylywayr/openwrt-cloudflare-ip-speed-helper/main/install.sh | sh
```

**离线安装：**
1. 下载对应架构的离线包
2. 解压后执行 `sh install.sh`
