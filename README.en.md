# OpenWrt Cloudflare IP Speed Helper

[中文说明](README.md)

Cloudflare IP selection helper for OpenWrt / iStoreOS.

Includes:

- `cf-ip-speed-client`
  Uses `cfst` for initial candidate filtering and latency sorting, then runs custom download speed tests, cache management, failure eviction, manual seed IPs, and proxy stop / restore flow.
- `luci-app-cf-ip-speed-client`
  LuCI panel at `Services -> Cloudflare IP 优选助手`.

## Features

- `IPv4`, `IPv6`, `IPv4 + IPv6`
- Multi-port testing, optional forced `443`
- Custom download test URL
- Top `50` candidates, `3` speed tests each, `6` threads
- Top 5 result display
- Local cache pool of `100`
- Failure-count based eviction
- Manual IP seed input
- Live log panel
- Stops common proxy services before testing, restores after finish

## Install

### Method 1: one-line installer

Tested on OpenWrt 23/24, iStoreOS, `opkg` environments.

```sh
wget -qO- https://raw.githubusercontent.com/lylywayr/openwrt-cloudflare-ip-speed-helper/main/install.sh | sh
```

Or:

```sh
curl -fsSL https://raw.githubusercontent.com/lylywayr/openwrt-cloudflare-ip-speed-helper/main/install.sh | sh
```

### Method 2: install specific version

```sh
wget -O /tmp/cf-ip-speed-install.sh https://raw.githubusercontent.com/lylywayr/openwrt-cloudflare-ip-speed-helper/main/install.sh
REF=v0.2.0 sh /tmp/cf-ip-speed-install.sh
```

### Method 3: offline `.ipk`

Release assets include universal `all` packages:

- `cf-ip-speed-client_<version>_all.ipk`
- `luci-app-cf-ip-speed-client_<version>_all.ipk`

Install:

```sh
opkg install ./cf-ip-speed-client_0.2.0_all.ipk ./luci-app-cf-ip-speed-client_0.2.0_all.ipk
```

Then install `cfst`, or run `install.sh` once to finish dependencies and `cfst`.

## Build release locally

Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-release.ps1
```

Linux / macOS:

```sh
bash ./scripts/build-release.sh
```

Output:

```text
dist/
```

## License

[MIT](LICENSE)
