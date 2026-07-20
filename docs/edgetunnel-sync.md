# edgetunnel ADD.txt 自动同步

本功能用于在本地 Cloudflare IP 优选任务完成后，把本轮缓存中的优选 IP 覆盖写入 edgetunnel 面板的 `admin/ADD.txt`。

同步行为：

- 默认关闭。
- 只在本轮优选成功后执行。
- 远端 `ADD.txt` 会被完整覆盖，旧 IP 不会保留。
- IPv4 默认写入前 20 条，IPv6 默认写入前 10 条。
- 面板密码只保存在路由器本地 UCI 配置中，不写入本仓库。

示例配置：

```sh
uci set cf_ip_speed_client.main.edgetunnel_sync_enabled='1'
uci set cf_ip_speed_client.main.edgetunnel_sync_url='https://cfyx.lylywayr.asia'
uci set cf_ip_speed_client.main.edgetunnel_sync_password='<edgetunnel 面板密码>'
uci set cf_ip_speed_client.main.edgetunnel_sync_v4_count='20'
uci set cf_ip_speed_client.main.edgetunnel_sync_v6_count='10'
uci commit cf_ip_speed_client
/usr/bin/cf-ip-speed-client cron
```

LuCI 面板位置：

```text
服务 -> Cloudflare IP 优选助手 -> 基本设置 -> 同步到 edgetunnel
```
