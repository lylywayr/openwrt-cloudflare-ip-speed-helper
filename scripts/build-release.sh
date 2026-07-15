#!/bin/sh

set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)"
VERSION="${1:-$(cat "${REPO_ROOT}/VERSION")}"
DIST_DIR="${REPO_ROOT}/dist"
BUILD_DIR="${REPO_ROOT}/build"

rm -rf "$DIST_DIR" "$BUILD_DIR"
mkdir -p "$DIST_DIR" "$BUILD_DIR"

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

new_ipk "cf-ip-speed-client"
new_ipk "luci-app-cf-ip-speed-client"
cp "${REPO_ROOT}/install.sh" "${DIST_DIR}/install.sh"
