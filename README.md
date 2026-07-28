# OpenWrt Cloudflare IP 优选助手

[English](README.en.md)

面向 OpenWrt / iStoreOS 的 Cloudflare IP 优选方案。

包含两部分：

- `cf-ip-speed-client`
  使用 `cfst` 做候选初筛与延迟排序，再用自定义逻辑做下载测速、缓存管理、失败淘汰、手动补种、代理停启控制。
- `luci-app-cf-ip-speed-client`
  LuCI 面板，入口 `服务 -> Cloudflare IP 优选助手`。

## 功能

- 支持 `IPv4`、`IPv6`、`IPv4 + IPv6`
- 支持多端口优选，`443` 可强制包含
- 支持自定义测速地址
- 候选 `50` 个、每个测速 `3` 次、线程数 `6`
- 结果前 `5` 展示
- 本地缓存池 `100` 条
- 失败次数累计淘汰
- 手动补种 IP
- 实时日志
- 优选前自动停止常见代理服务，结束后自动恢复
- 适配中国大陆网络环境

## 文档

- [如何自建测速地址](docs/self-hosted-speed-url.md)

## 截图

### 基本设置

![基本设置](docs/screenshots/basic.jpg)

### 缓存管理

![缓存管理](docs/screenshots/cache.jpg)

### 实时日志

![实时日志](docs/screenshots/log.jpg)

## 安装

### 先看装哪个

- `方式 1：一键安装`
  最推荐。路由器能联网、想直接装最新版，用这个。
- `方式 2：指定版本安装`
  需要锁版本、回滚版本、复现旧版本行为时，用这个。
- `方式 3：离线整包安装`
  路由器不方便直连 GitHub，或需要先把整包下载到电脑后再手动上传时，用这个。

上面 3 种方式都会把 `cfst` 一起装好，不需要再额外单独安装 `cfst`。

### 方式 1：一键安装

适合 OpenWrt 23/24、iStoreOS、`opkg` 环境。

```sh
wget -qO- https://raw.githubusercontent.com/lylywayr/openwrt-cloudflare-ip-speed-helper/main/install.sh | sh
```

如果设备只有 `curl`：

```sh
curl -fsSL https://raw.githubusercontent.com/lylywayr/openwrt-cloudflare-ip-speed-helper/main/install.sh | sh
```

安装脚本会：

- 检查并安装依赖
- 自动安装 `cfst`
- 安装客户端与 LuCI 面板文件
- 保留已有配置并补齐缺省项
- 刷新 `rpcd`、`uhttpd`、`cron`

安装完成后进入：

```text
服务 -> Cloudflare IP 优选助手
```

### 方式 2：指定版本安装

适合你明确知道要安装哪一版。

```sh
wget -O /tmp/cf-ip-speed-install.sh https://raw.githubusercontent.com/lylywayr/openwrt-cloudflare-ip-speed-helper/main/install.sh
REF=v0.2.3 sh /tmp/cf-ip-speed-install.sh
```

它和方式 1 的区别只有一件事：

- 方式 1 永远取当前最新版
- 方式 2 由使用者自行指定 tag / branch / commit

### 方式 3：离线整包安装

适合：

- 路由器不方便直接访问 GitHub
- 想先把安装包下载到本地再上传
- 想把 `cfst` 和本项目一次性一起带走

Release 会附带以下离线整包：

- `cf-ip-speed-offline_x86_64_<version>.tar.gz`
- `cf-ip-speed-offline_arm64_<version>.tar.gz`
- `cf-ip-speed-offline_armv7_<version>.tar.gz`
- `cf-ip-speed-offline_mips_<version>.tar.gz`

#### 第一步：先看设备架构

任选一个命令：

```sh
ubus call system board
```

或：

```sh
grep DISTRIB_ARCH /etc/openwrt_release
```

常见对应关系：

- `x86_64`
  下载 `cf-ip-speed-offline_x86_64_<version>.tar.gz`
- `aarch64_generic` / `aarch64_cortex-a53` / `aarch64_cortex-a72` / `arm64`
  下载 `cf-ip-speed-offline_arm64_<version>.tar.gz`
- `arm_cortex-a7_neon-vfpv4` / `armv7` / `armhf`
  下载 `cf-ip-speed-offline_armv7_<version>.tar.gz`
- `mips_24kc` / `mips`
  下载 `cf-ip-speed-offline_mips_<version>.tar.gz`

#### 第二步：上传并解压

把对应压缩包传到路由器，比如传到 `/tmp`：

```sh
cd /tmp
tar -xzf cf-ip-speed-offline_x86_64_0.2.3.tar.gz
cd cf-ip-speed-offline_x86_64_0.2.3
sh ./install.sh
```

离线整包里已经内置：

- `cfst`
- 客户端文件
- LuCI 面板文件
- 安装脚本

所以这一种方式也不需要你再单独安装 `cfst`。

#### 第三步：进入面板

```text
服务 -> Cloudflare IP 优选助手
```

## 升级

### 在线升级

```sh
wget -qO- https://raw.githubusercontent.com/lylywayr/openwrt-cloudflare-ip-speed-helper/main/install.sh | sh
```

### 锁版本升级

```sh
wget -O /tmp/cf-ip-speed-install.sh https://raw.githubusercontent.com/lylywayr/openwrt-cloudflare-ip-speed-helper/main/install.sh
REF=v0.2.3 sh /tmp/cf-ip-speed-install.sh
```

### 离线整包升级

换成新版本离线整包，重新执行：

```sh
sh ./install.sh
```

安装脚本会先备份现有文件到：

```text
/tmp/cf-ip-speed-backup-时间戳
```

## 卸载

```sh
/etc/init.d/cf-ip-speed-client disable || true
rm -f /usr/bin/cf-ip-speed-client
rm -f /etc/init.d/cf-ip-speed-client
rm -f /etc/config/cf_ip_speed_client
rm -rf /etc/cf-ip-speed-client
rm -f /www/luci-static/resources/view/services/cf_ip_speed_client.js
rm -f /usr/share/rpcd/acl.d/luci-app-cf-ip-speed-client.json
rm -f /usr/share/luci/menu.d/luci-app-cf-ip-speed-client.json
rm -rf /tmp/luci-indexcache /tmp/luci-modulecache
/etc/init.d/rpcd restart
/etc/init.d/uhttpd restart
```

## 本地打包 Release

Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-release.ps1
```

Linux / macOS:

```sh
bash ./scripts/build-release.sh
```

输出目录：

```text
dist/
```

默认生成：

- `cf-ip-speed-client_0.2.3_all.ipk`
- `luci-app-cf-ip-speed-client_0.2.3_all.ipk`
- `install.sh`
- `cf-ip-speed-offline_x86_64_0.2.3.tar.gz`
- `cf-ip-speed-offline_arm64_0.2.3.tar.gz`
- `cf-ip-speed-offline_armv7_0.2.3.tar.gz`
- `cf-ip-speed-offline_mips_0.2.3.tar.gz`

说明：

- 原始 `.ipk` 仍然会保留，适合二次打包、自建软件源、开发调试
- 普通用户安装，优先使用上面 3 种安装方式，不建议手工只拿 `.ipk` 拼流程

## 注意

- 当前安装脚本主测 `opkg` 环境
- `cfst` 资源默认来自 [XIU2/CloudflareSpeedTest](https://github.com/XIU2/CloudflareSpeedTest)
- 若 `测速地址` 留空，脚本会回退到官方 `https://speed.cloudflare.com/__down?bytes=10485760`
- 离线整包已内置 `cfst`，但如果系统极度精简，基础依赖仍建议优先用在线安装补齐
- 这套逻辑默认会在优选时停止常见代理服务；请不要在关键业务时间段直接启动优选
- 首次安装后建议先检查 `测速地址`、`IP 模式`、`端口`、`执行计划`

## 常见问题

### 1. 页面更新了，但 LuCI 还是旧界面

```sh
rm -rf /tmp/luci-indexcache /tmp/luci-modulecache
/etc/init.d/uhttpd restart
```

### 2. 为什么优选开始后代理会停掉

设计如此。优选测速要尽量走本机真实出口，否则测速结果会混入代理链路，失真。

### 3. 缓存为什么没有数据

常见原因：

- 刚装完还没跑过一轮
- 测速地址不可用
- `cfst` 不存在或执行失败
- 前端缓存未刷新

先看：

```sh
/usr/bin/cf-ip-speed-client show-status
/usr/bin/cf-ip-speed-client show-log
```

### 4. 手动添加的 IP 为什么又没了

手动添加只是加入下一轮候选。若测速不达标、未进入自动缓存，会被同步清理。这是当前设计。

### 5. 多端口没有生效怎么办

检查：

- `始终包含 443 端口` 是否开启
- `自定义端口` 是否用英文逗号分隔
- 当前 `测速地址` 是否允许这些端口

## 许可

[MIT](LICENSE)
