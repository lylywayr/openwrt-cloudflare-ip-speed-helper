#!/bin/sh

set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)"
VERSION="${1:-$(cat "${REPO_ROOT}/VERSION")}"
DIST_DIR="${REPO_ROOT}/dist"
BUILD_DIR="${REPO_ROOT}/build"
DOWNLOAD_DIR="${BUILD_DIR}/downloads"
CFST_REPO="${CFST_REPO:-XIU2/CloudflareSpeedTest}"
CFST_TAG="${CFST_TAG:-v2.3.5}"
CFST_BASE_URL="https://github.com/${CFST_REPO}/releases/download/${CFST_TAG}"

rm -rf "$DIST_DIR" "$BUILD_DIR"
mkdir -p "$DIST_DIR" "$BUILD_DIR" "$DOWNLOAD_DIR"

new_ipk() {
  pkg="$1"
  pkg_root="${BUILD_DIR}/${pkg}"
  meta_src="${REPO_ROOT}/packaging/${pkg}"
  files_src="${REPO_ROOT}/packages/${pkg}/files"
  control_dir="${pkg_root}/control"
  data_dir="${pkg_root}/data"

  mkdir -p "$control_dir" "$data_dir"
  cp -a "${files_src}/." "$data_dir/"
  [ ! -f "${meta_src}/conffiles" ] || cp "${meta_src}/conffiles" "$control_dir/"
  [ ! -f "${meta_src}/postinst" ] || cp "${meta_src}/postinst" "$control_dir/"
  [ ! -f "${meta_src}/postinst-pkg" ] || cp "${meta_src}/postinst-pkg" "$control_dir/"
  [ ! -f "${meta_src}/prerm" ] || cp "${meta_src}/prerm" "$control_dir/"

  sed "s/@VERSION@/${VERSION}/g" "${meta_src}/control" > "${control_dir}/control"
  printf '2.0\n' > "${pkg_root}/debian-binary"

  tar -C "$control_dir" -czf "${pkg_root}/control.tar.gz" .
  tar -C "$data_dir" -czf "${pkg_root}/data.tar.gz" .
  tar -C "$pkg_root" -cf "${DIST_DIR}/${pkg}_${VERSION}_all.ipk" debian-binary control.tar.gz data.tar.gz
}

download_file() {
  url="$1"
  out="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --connect-timeout 20 --retry 2 --retry-delay 2 -o "$out" "$url"
  else
    wget -O "$out" "$url"
  fi
}

get_cfst_binary() {
  asset="$1"
  archive="${DOWNLOAD_DIR}/${asset}"
  unpack="${BUILD_DIR}/cfst-${asset%.tar.gz}"

  [ -f "$archive" ] || download_file "${CFST_BASE_URL}/${asset}" "$archive"
  rm -rf "$unpack"
  mkdir -p "$unpack"
  tar -xzf "$archive" -C "$unpack"

  cfst_bin="$(find "$unpack" -type f -name cfst 2>/dev/null | head -n 1)"
  [ -n "$cfst_bin" ] || {
    echo "cfst binary not found in ${asset}" >&2
    exit 1
  }
  printf '%s\n' "$cfst_bin"
}

new_offline_bundle() {
  bundle_arch="$1"
  asset="$2"
  match="$3"
  bundle_name="cf-ip-speed-offline_${bundle_arch}_${VERSION}"
  bundle_root="${BUILD_DIR}/${bundle_name}"
  offline_assets_dir="${bundle_root}/offline-assets"

  rm -rf "$bundle_root"
  mkdir -p "$bundle_root" "$offline_assets_dir"

  cp "${REPO_ROOT}/install.sh" "${bundle_root}/install.sh"
  cp "${REPO_ROOT}/README.md" "${bundle_root}/README.md"
  cp "${REPO_ROOT}/README.en.md" "${bundle_root}/README.en.md"
  cp -a "${REPO_ROOT}/packages" "${bundle_root}/packages"
  cp "$(get_cfst_binary "$asset")" "${offline_assets_dir}/cfst"

  cat > "${bundle_root}/BUNDLE-README.txt" <<EOF
离线整包

版本: ${VERSION}
适用架构: ${match}

安装:
1. 上传并解压本压缩包
2. 进入解压目录
3. 执行: sh ./install.sh

说明:
- 本整包已内置 cfst
- install.sh 会优先使用整包内本地文件
- 若系统缺少基础依赖, install.sh 会尝试通过 opkg 补齐
EOF

  tar -C "$BUILD_DIR" -czf "${DIST_DIR}/${bundle_name}.tar.gz" "${bundle_name}"
}

new_ipk "cf-ip-speed-client"
new_ipk "luci-app-cf-ip-speed-client"
cp "${REPO_ROOT}/install.sh" "${DIST_DIR}/install.sh"

new_offline_bundle "x86_64" "cfst_linux_amd64.tar.gz" "x86_64"
new_offline_bundle "arm64" "cfst_linux_arm64.tar.gz" "aarch64_generic / aarch64_cortex-a53 / aarch64_cortex-a72 / arm64"
new_offline_bundle "armv7" "cfst_linux_armv7.tar.gz" "arm_cortex-a7_neon-vfpv4 / armv7 / armhf"
new_offline_bundle "mips" "cfst_linux_mips.tar.gz" "mips_24kc / mips"
