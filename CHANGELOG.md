<<<<<<< HEAD
## 0.2.5

- 同步 v0.2.4-beta.4：仅 HKG/LAX/SJC 机房、每端口每机房前 10 个零丢包候选、单线程无阈值下载测速。
- 改进移动端实时日志、EdgeTunnel 测速注释和 Pages 自定义域名自动绑定。
=======
## 0.2.4-beta.5

- 自动生成测速地址改为 Cloudflare Pages 静态 10 MiB 文件，不创建或调用 Worker，避免消耗 Workers 请求额度。
- 每次 Pages 发布自动生成并验证 `__speed/10m.bin`，完成后自动回填 Pages 静态测速 URL。
- 发布前去敏：移除 EdgeTunnel 私人域名示例，默认配置不含私人域名、账户或凭据。
>>>>>>> beta

## 0.2.4-beta.4

- 优选限定 HKG、LAX、SJC 三个机房；每个端口独立保留丢包率为 0、延迟最低的前 10 个候选。
- 下载测速改为单线程逐 IP 进行，取消速度阈值，避免并发争抢带宽导致测速失真。
- 实时日志新增 IP/端口、机房/国家与速度明细；优化移动端自动换行、日志跟随与操作按钮布局。
- EdgeTunnel 同步结果注释增加机房/国家、延迟和下载速度。
- 修复 IPv6 无默认路由时影响 IPv4 任务、Pages 自定义域名自动绑定与 DNS 校验。

## 0.2.4-beta.3

- Worker 自动测速地址创建增加预检查：检测 Worker 名称、二级域名 DNS 记录和 Worker 路由占用，避免覆盖已有项目或服务。
- 域名下拉框异步加载后保留已选择值，并将测速 Worker 自定义域名改为自动读取的下拉选择。
- 修复授权保存竞态、Worker 上传格式与运行时兼容性、创建日志重复及更明确的 DNS 诊断。

## 0.2.4-beta.2

- 恢复“自定义测速地址”输入框，支持自动保存手动填写的下载地址。
- 新增可选域名的 Cloudflare Worker 一键测速地址创建：默认使用 workers.dev，也可绑定自有 Cloudflare 域名。
- 新增 Worker 创建授权校验、实时创建进度、完成后自动验证并回填测速 URL。
- 新增“如何创建自定义测速地址”内置教程页面。

## 0.2.4-beta.1

- 实时日志改为限量轮询，避免 cfst 大日志导致 LuCI 页面停止更新。
- EdgeTunnel 同步修复 `/admin` 地址处理及速度、延迟字段映射。
- Pages 弹窗仅记录用户授权；首次实际发布时才按需创建 Token。
- 支持用户自行输入并安全保存 Pages 发布 API Token。
- 前端选择框和输入框改为自动持久化。

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
