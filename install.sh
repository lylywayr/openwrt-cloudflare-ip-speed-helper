#!/bin/sh

set -eu

REPO="${REPO:-lylywayr/openwrt-cloudflare-ip-speed-helper}"
REF="${REF:-main}"
RAW_BASE="https://raw.githubusercontent.com/${REPO}/${REF}"
CFST_REPO="${CFST_REPO:-XIU2/CloudflareSpeedTest}"
CFST_TAG="${CFST_TAG:-v2.3.5}"
CFST_BASE_URL="https://github.com/${CFST_REPO}/releases/download/${CFST_TAG}"
TMP_DIR="/tmp/cf-ip-speed-install"
BACKUP_DIR="/tmp/cf-ip-speed-backup-$(date +%Y%m%d-%H%M%S)"
SCRIPT_DIR=""
LOCAL_REPO_ROOT=""
LOCAL_CFST_BIN=""

case "${0:-}" in
  */*)
    SCRIPT_DIR="$(CDPATH= cd -- "$(dirname "$0")" 2>/dev/null && pwd || true)"
    ;;
esac

if [ -n "$SCRIPT_DIR" ] && \
  [ -d "$SCRIPT_DIR/packages/cf-ip-speed-client/files" ] && \
  [ -d "$SCRIPT_DIR/packages/luci-app-cf-ip-speed-client/files" ]; then
  LOCAL_REPO_ROOT="$SCRIPT_DIR"
fi

if [ -n "$LOCAL_REPO_ROOT" ] && [ -f "$LOCAL_REPO_ROOT/offline-assets/cfst" ]; then
  LOCAL_CFST_BIN="$LOCAL_REPO_ROOT/offline-assets/cfst"
fi

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

info() {
  echo "[cf-ip-speed] $*"
}

has_cmd() {
  command -v "$1" >/dev/null 2>&1
}

need_cmd() {
  has_cmd "$1" || fail "缺少命令：$1"
}

download() {
  url="$1"
  output="$2"

  if has_cmd curl; then
    curl -fsSL --connect-timeout 20 --retry 2 --retry-delay 2 -o "$output" "$url"
  elif has_cmd wget; then
    wget --no-check-certificate -O "$output" "$url"
  else
    fail "缺少下载工具：curl 或 wget"
  fi
}

download_raw() {
  path="$1"
  output="$2"
  if [ -n "$LOCAL_REPO_ROOT" ] && [ -f "${LOCAL_REPO_ROOT}/${path}" ]; then
    cp -f "${LOCAL_REPO_ROOT}/${path}" "$output"
    return
  fi
  download "${RAW_BASE}/${path}" "$output"
}

detect_arch_from_opkg() {
  opkg print-architecture 2>/dev/null | awk '
    $1 == "arch" && $2 != "all" && $2 != "noarch" {
      arch = $2
    }
    END {
      if (arch != "") print arch
    }
  '
}

normalize_arch() {
  arch="$1"
  case "$arch" in
    x86_64|aarch64_generic|aarch64_cortex-a53|aarch64_cortex-a72|arm_cortex-a7_neon-vfpv4|mips_24kc)
      echo "$arch"
      ;;
    aarch64|arm64)
      echo "aarch64_cortex-a53"
      ;;
    armv7|armhf)
      echo "arm_cortex-a7_neon-vfpv4"
      ;;
    mips)
      echo "mips_24kc"
      ;;
    *)
      fail "当前架构暂未支持自动安装 cfst：${arch:-unknown}"
      ;;
  esac
}

detect_arch() {
  arch=""
  [ -f /etc/openwrt_release ] && arch="$(sed -n "s/^DISTRIB_ARCH='\\(.*\\)'/\\1/p" /etc/openwrt_release | head -n 1)"
  [ -n "$arch" ] || arch="$(detect_arch_from_opkg)"
  normalize_arch "$arch"
}

detect_cfst_asset() {
  arch="$1"
  case "$arch" in
    x86_64) echo "cfst_linux_amd64.tar.gz" ;;
    aarch64_generic|aarch64_cortex-a53|aarch64_cortex-a72) echo "cfst_linux_arm64.tar.gz" ;;
    arm_cortex-a7_neon-vfpv4) echo "cfst_linux_armv7.tar.gz" ;;
    mips_24kc) echo "cfst_linux_mips.tar.gz" ;;
    *) fail "当前架构暂未匹配到 cfst 资源：$arch" ;;
  esac
}

install_deps() {
  if has_cmd opkg; then
    info "检查依赖"
    opkg update || true
    missing=""
    for pkg in curl ca-bundle ip-full jsonfilter openssl-util luci-base rpcd uhttpd; do
      opkg list-installed "$pkg" >/dev/null 2>&1 || missing="$missing $pkg"
    done
    [ -z "$missing" ] || opkg install $missing
    return
  fi

  fail "当前安装脚本主测 opkg / iStoreOS / OpenWrt 23/24。未检测到 opkg。"
}

backup_existing() {
  mkdir -p "$BACKUP_DIR"
  [ -f /etc/config/cf_ip_speed_client ] && cp -a /etc/config/cf_ip_speed_client "$BACKUP_DIR/" || true
  [ -d /etc/cf-ip-speed-client ] && cp -a /etc/cf-ip-speed-client "$BACKUP_DIR/" || true
  [ -f /usr/bin/cf-ip-speed-client ] && cp -a /usr/bin/cf-ip-speed-client "$BACKUP_DIR/" || true
  [ -f /www/luci-static/resources/view/services/cf_ip_speed_client.js ] && cp -a /www/luci-static/resources/view/services/cf_ip_speed_client.js "$BACKUP_DIR/" || true
  info "已备份到 $BACKUP_DIR"
}

install_cfst() {
  if has_cmd cfst && [ "${CFST_FORCE_INSTALL:-0}" != "1" ]; then
    info "已检测到 cfst：$(command -v cfst)"
    return
  fi

  if [ -n "$LOCAL_CFST_BIN" ] && [ -f "$LOCAL_CFST_BIN" ]; then
    info "安装离线整包内置 cfst"
    install -m 755 "$LOCAL_CFST_BIN" /usr/bin/cfst
    return
  fi

  arch="$(detect_arch)"
  asset="$(detect_cfst_asset "$arch")"
  archive="${TMP_DIR}/cfst.tar.gz"
  unpack="${TMP_DIR}/cfst-unpack"

  rm -rf "$unpack"
  mkdir -p "$unpack"
  info "安装 cfst：${CFST_TAG} / ${asset}"
  download "${CFST_BASE_URL}/${asset}" "$archive"
  tar -xzf "$archive" -C "$unpack"

  cfst_bin=""
  [ -f "$unpack/cfst" ] && cfst_bin="$unpack/cfst"
  [ -n "$cfst_bin" ] || cfst_bin="$(find "$unpack" -type f -name cfst 2>/dev/null | head -n 1)"
  [ -n "$cfst_bin" ] || fail "cfst 压缩包内未找到 cfst 二进制"

  install -m 755 "$cfst_bin" /usr/bin/cfst
}

apply_defaults() {
  uci -q get cf_ip_speed_client.main.enabled >/dev/null || uci set cf_ip_speed_client.main.enabled='0'
  uci -q get cf_ip_speed_client.main.ip_mode >/dev/null || uci set cf_ip_speed_client.main.ip_mode='dual'
  uci -q get cf_ip_speed_client.main.include_443 >/dev/null || uci set cf_ip_speed_client.main.include_443='1'
  uci -q get cf_ip_speed_client.main.custom_ports >/dev/null || uci set cf_ip_speed_client.main.custom_ports=''
  uci -q get cf_ip_speed_client.main.test_url >/dev/null || uci set cf_ip_speed_client.main.test_url=''
  uci -q get cf_ip_speed_client.main.schedule_mode >/dev/null || uci set cf_ip_speed_client.main.schedule_mode='daily'
  uci -q get cf_ip_speed_client.main.interval_hours >/dev/null || uci set cf_ip_speed_client.main.interval_hours='6'
  uci -q get cf_ip_speed_client.main.daily_hour >/dev/null || uci set cf_ip_speed_client.main.daily_hour='3'
  uci -q get cf_ip_speed_client.main.daily_minute >/dev/null || uci set cf_ip_speed_client.main.daily_minute='0'
  uci -q get cf_ip_speed_client.main.result_file >/dev/null || uci set cf_ip_speed_client.main.result_file='/tmp/cf-ip-speed-client/result.csv'
  uci -q get cf_ip_speed_client.main.log_clear_interval >/dev/null || uci set cf_ip_speed_client.main.log_clear_interval='weekly'
  uci commit cf_ip_speed_client
}

install_files() {
  mkdir -p \
    /usr/bin \
    /etc/config \
    /etc/init.d \
    /etc/cf-ip-speed-client \
    /www/luci-static/resources/view/services \
    /usr/share/rpcd/acl.d \
    /usr/share/luci/menu.d

  download_raw "packages/cf-ip-speed-client/files/usr/bin/cf-ip-speed-client" "${TMP_DIR}/cf-ip-speed-client"
  download_raw "packages/cf-ip-speed-client/files/etc/config/cf_ip_speed_client" "${TMP_DIR}/cf_ip_speed_client"
  download_raw "packages/cf-ip-speed-client/files/etc/init.d/cf-ip-speed-client" "${TMP_DIR}/initd-cf-ip-speed-client"
  download_raw "packages/cf-ip-speed-client/files/etc/cf-ip-speed-client/ip.txt" "${TMP_DIR}/ip.txt"
  download_raw "packages/cf-ip-speed-client/files/etc/cf-ip-speed-client/ip-v6.txt" "${TMP_DIR}/ip-v6.txt"
  download_raw "packages/luci-app-cf-ip-speed-client/files/www/luci-static/resources/view/services/cf_ip_speed_client.js" "${TMP_DIR}/cf_ip_speed_client.js"
  download_raw "packages/luci-app-cf-ip-speed-client/files/usr/share/rpcd/acl.d/luci-app-cf-ip-speed-client.json" "${TMP_DIR}/acl.json"
  download_raw "packages/luci-app-cf-ip-speed-client/files/usr/share/luci/menu.d/luci-app-cf-ip-speed-client.json" "${TMP_DIR}/menu.json"

  install -m 755 "${TMP_DIR}/cf-ip-speed-client" /usr/bin/cf-ip-speed-client
  install -m 755 "${TMP_DIR}/initd-cf-ip-speed-client" /etc/init.d/cf-ip-speed-client
  install -m 644 "${TMP_DIR}/cf_ip_speed_client.js" /www/luci-static/resources/view/services/cf_ip_speed_client.js
  install -m 644 "${TMP_DIR}/acl.json" /usr/share/rpcd/acl.d/luci-app-cf-ip-speed-client.json
  install -m 644 "${TMP_DIR}/menu.json" /usr/share/luci/menu.d/luci-app-cf-ip-speed-client.json

  [ -f /etc/config/cf_ip_speed_client ] || install -m 644 "${TMP_DIR}/cf_ip_speed_client" /etc/config/cf_ip_speed_client
  install -m 644 "${TMP_DIR}/ip.txt" /etc/cf-ip-speed-client/ip.txt
  install -m 644 "${TMP_DIR}/ip-v6.txt" /etc/cf-ip-speed-client/ip-v6.txt
}

reload_services() {
  apply_defaults
  /etc/init.d/cf-ip-speed-client enable >/dev/null 2>&1 || true
  /usr/bin/cf-ip-speed-client cron || true
  rm -rf /tmp/luci-indexcache /tmp/luci-modulecache
  /etc/init.d/rpcd reload >/dev/null 2>&1 || /etc/init.d/rpcd restart >/dev/null 2>&1 || true
  /etc/init.d/uhttpd reload >/dev/null 2>&1 || /etc/init.d/uhttpd restart >/dev/null 2>&1 || true
  /etc/init.d/cron reload >/dev/null 2>&1 || true
}

need_cmd sed
need_cmd awk
need_cmd tar
need_cmd install
need_cmd mkdir
need_cmd chmod
need_cmd uci

rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR"

if [ -n "$LOCAL_REPO_ROOT" ]; then
  info "检测到本地离线整包，优先使用本地文件安装"
fi

install_deps
backup_existing
install_cfst
install_files
reload_services

info "安装完成"
info "菜单位置：服务 -> Cloudflare IP 优选助手"
info "如页面未更新，请强制刷新浏览器缓存"
