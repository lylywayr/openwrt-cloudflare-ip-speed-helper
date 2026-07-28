# 如何自建测速地址

目标：

- 不在仓库里内置私有测速域名
- 其他设备安装后默认可留空
- 需要时可单独填写专用测速地址
- 优选结果尽量贴近真实出口环境

当前项目里，`测速地址` 是可选项：

- 手动填写：使用自定义测速地址
- 留空：自动回退到官方 `https://speed.cloudflare.com/__down?bytes=10485760`

这意味着：

- 仓库不会写死私有测速地址
- 私有测速域名不会跟着安装脚本一并分发

## 一、为什么要自建测速地址

公共测速地址有几个问题：

- 大家共用，波动大
- 可能被限速
- 结果容易受外部环境影响
- 长期对比不稳定

自建后好处：

- 目标固定
- 更容易长期复测
- 更接近实际使用环境
- 可自由控制文件大小

## 二、这套优选是怎么用测速地址的

实际过程：

1. `cfst` 先筛选候选 Cloudflare IP
2. 脚本把测速域名强制 `--resolve` 到候选 IP
3. 对这个候选 IP 做真实下载测速
4. 记录速度、延迟、丢包、机房

所以测速地址必须满足：

- 域名能访问
- 返回码稳定是 `200`
- 下载内容稳定
- 文件大小足够，建议 `10MB`
- 最好整个域名本身就走 Cloudflare

## 三、推荐方案

推荐：

```text
Cloudflare Worker + 自定义域名
```

推荐测速地址格式：

```text
https://cfspeed.example.com/__down?bytes=10485760
```

其中：

- `cfspeed.example.com` 是自定义测速子域名
- `__down` 是测速路径
- `10485760` 是 `10MB`

## 四、准备条件

准备条件：

- 一个 Cloudflare 账户
- 一个已接入 Cloudflare 的域名
- 能新增 DNS 记录
- 能创建 Worker

## 五、最简单可用的 Worker 代码

新建一个 Worker，内容如下：

```js
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const bytes = Math.max(1, Math.min(
      Number(url.searchParams.get("bytes") || "10485760"),
      104857600
    ));

    const chunk = new Uint8Array(65536);

    const stream = new ReadableStream({
      start(controller) {
        let sent = 0;
        while (sent < bytes) {
          const remain = bytes - sent;
          controller.enqueue(remain >= chunk.length ? chunk : chunk.slice(0, remain));
          sent += Math.min(chunk.length, remain);
        }
        controller.close();
      }
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Content-Disposition": `attachment; filename=\"speed-${bytes}.bin\"`
      }
    });
  }
};
```

访问：

```text
https://example.com/__down?bytes=10485760
```

应直接下载一个约 `10MB` 的文件。

## 六、创建 Worker

步骤：

1. 登录 Cloudflare
2. 进入 `Workers & Pages`
3. 创建 Worker
4. 粘贴上面的代码
5. 保存并部署

部署后会先得到一个：

```text
https://xxxx.workers.dev
```

可以临时测试，但不建议长期直接使用。

## 七、绑定自定义域名

推荐单独一个测速子域名：

```text
cfspeed.example.com
```

可选两种：

### 方式 1：自定义域

直接绑定：

```text
cfspeed.example.com
```

### 方式 2：Route

绑定规则：

```text
cfspeed.example.com/*
```

两种都可以。

## 八、DNS 应该怎么配

最关键一点：

```text
必须橙云
```

示例：

```text
Type: A 或 AAAA
Name: cfspeed
Proxy status: Proxied
```

灰云不行。

因为灰云会绕过 Cloudflare 边缘，优选结果会失真。

## 九、怎么验证测速地址可用

### 浏览器验证

直接打开：

```text
https://cfspeed.example.com/__down?bytes=10485760
```

预期：

- 能正常下载
- 不报证书错误
- 返回内容不是 HTML 错页

### 命令行验证

```sh
curl -I "https://cfspeed.example.com/__down?bytes=10485760"
```

建议至少看到：

```text
HTTP/1.1 200 OK
```

## 十、在面板里怎么填

把 `测速地址` 填成：

```text
https://cfspeed.example.com/__down?bytes=10485760
```

如果要更长下载：

```text
https://cfspeed.example.com/__down?bytes=20971520
```

也就是 `20MB`。

## 十一、Cloudflare 后台逐步操作示例

下面按最常见的做法写，默认你已经有一个接入 Cloudflare 的域名。

### 方案 A：直接在 Cloudflare Dashboard 创建 Worker

1. 登录 Cloudflare。
2. 左侧进入 `Workers & Pages`。
3. 点击 `Create application`。
4. 选择 `Create Worker`。
5. 给它一个名字，比如：

```text
cfspeed-worker
```

6. 点击创建后，进入在线编辑器。
7. 删掉默认示例代码。
8. 粘贴前面那段 Worker 代码。
9. 点击 `Deploy`。
10. 部署完成后，先访问系统自动分配的地址：

```text
https://worker-name.example-subdomain.workers.dev/__down?bytes=10485760
```

11. 如果这里已经能下载一个二进制文件，说明 Worker 本身没问题。

### 方案 B：给 Worker 绑定自定义测速域名

1. 进入刚才那个 Worker。
2. 打开 `Settings`。
3. 找到 `Domains & Routes`。
4. 选择 `Add Custom Domain` 或 `Add Route`。
5. 推荐直接绑定一个独立子域名，例如：

```text
cfspeed.example.com
```

6. 保存后等待 Cloudflare 下发证书。
7. 回到 DNS 页面，确认这个记录是橙云状态。

### 方案 C：如果你喜欢用 Wrangler

本项目不依赖 Wrangler，但如果你更习惯本地部署，也可以：

```sh
npm install -g wrangler
wrangler login
wrangler init cfspeed-worker
wrangler deploy
```

然后再到 Cloudflare 后台给这个 Worker 绑定自定义域名。

## 十二、如何确认测速地址真的适合本项目

需要确认的不只是“能打开”，而是“适合拿来做 Cloudflare IP 优选”。

至少检查下面几项：

### 1. 返回状态码必须稳定

```sh
curl -I "https://cfspeed.example.com/__down?bytes=10485760"
```

连续多试几次，都应是：

```text
HTTP/1.1 200 OK
```

### 2. 访问内容必须是下载流，不是 HTML 错页

如果浏览器打开后出现的是一整个网页，而不是下载内容，通常说明：

- Worker 路由没命中
- 自定义域名没绑到 Worker
- DNS 还没完全生效

### 3. 证书必须正常

浏览器访问时不能出现：

- 不安全连接
- 证书无效
- 证书名称不匹配

### 4. 文件大小要足够

建议从 `10MB` 开始：

```text
https://cfspeed.example.com/__down?bytes=10485760
```

如果本地带宽较高，也可以改成 `20MB`：

```text
https://cfspeed.example.com/__down?bytes=20971520
```

### 5. 不要让测速地址再经过额外代理

测速地址本身应尽量简单，不要叠加：

- 额外鉴权
- 跳转
- 复杂 WAF 规则
- 地区限制
- 二次反代链路

否则测出来的不是 Cloudflare IP 本身，而是额外附加链路的结果。

## 十三、推荐文件大小

建议：

- 默认：`10MB`
- 偏稳定：`20MB`
- 不建议太小，比如 `1MB`

太小的问题：

- 波动大
- 容易被瞬时速度干扰
- 很难拉开 IP 之间差距

## 十四、常见错误

### 1. 返回不是 200

检查：

- Worker 是否成功部署
- Route 是否绑对
- DNS 是否橙云
- 路径是否正确

建议固定：

```text
/__down?bytes=10485760
```

### 2. 证书错误

常见原因：

- 自定义域刚绑定，还没完全生效
- Cloudflare 证书还没签发完

### 3. 打开变成网页，不是下载

通常是：

- 代码没部署对
- 命中的是别的规则
- 路由没有指到 Worker

### 4. 测速慢但延迟正常

常见原因：

- 当前网络拥塞
- 测试文件太小
- Worker 路由异常
- 端口策略不同

### 5. 不同端口差异很大

这是正常现象。当前项目本来就支持多端口优选。

## 十五、推荐实践

### 1. 单独一个测速子域名

比如：

```text
cfspeed.example.com
```

### 2. 路径固定

统一固定成：

```text
/__down?bytes=10485760
```

### 3. 留空回退官方，按需手动填写

这也是当前仓库现在的默认设计：

- 仓库默认不写私有测速域名
- 需要时单独填写
- 没填就回退官方地址

## 十六、如果你不用 Cloudflare Worker，还有哪些替代方案

如果不想用 Worker，也可以自行搭一个下载端点，但要注意：这时测速目标就不再是“Cloudflare 边缘 Worker 域名”，而是“自有源站 + Cloudflare 前置”。

常见替代方案：

### 1. Nginx 静态文件

在源站准备一个固定大文件，比如：

```text
/var/www/html/speed/10m.bin
```

再暴露成：

```text
https://cfspeed.example.com/speed/10m.bin
```

优点：

- 简单
- 直观
- 易调试

缺点：

- 需要自行维护源站
- 文件大小固定
- 源站性能会影响测速

### 2. 对象存储前挂 Cloudflare

比如：

- R2
- S3 兼容存储
- 其他对象存储

再通过接入 Cloudflare 的域名对外暴露。

优点：

- 稳定
- 不用自己管主机

缺点：

- 配置稍复杂
- 某些对象存储本身也会带来额外波动

### 3. 已有下载域名

如果已经有长期稳定、确认走 Cloudflare、没有鉴权和跳转的大文件地址，也可直接使用。

前提仍然是：

- `200 OK`
- HTTPS 正常
- 文件稳定
- 可长期访问

## 十七、建议最终配置

对于大多数自用场景，建议最终定成：

```text
测速地址：https://cfspeed.example.com/__down?bytes=10485760
IP 模式：IPv4 + IPv6
始终包含 443：开启
自定义端口：按自己需要填写
```

如果你刚开始验证，建议先只测：

```text
443
```

先确保整个优选流程稳定，再逐步加入 `2053`、`2083`、`8443` 之类端口。

## 十八、最短检查清单

如果需要快速自检，可直接看这 8 条：

1. 域名已接入 Cloudflare。
2. 测速子域名是橙云。
3. Worker 已成功部署。
4. 自定义域名已绑定到 Worker。
5. `https://example.com/__down?bytes=10485760` 能正常下载。
6. `curl -I` 返回 `200 OK`。
7. 面板里填的就是这个完整 URL。
8. 优选前先确认测速地址没有额外鉴权或跳转。

## 十九、后续可扩展

后面还可以继续补：

- 单独 `workers/` 目录，直接放测速 Worker 源码
- “测速地址自检”按钮
- 自动创建测速 Worker 的部署脚本
- 自动校验返回码、证书、文件大小
