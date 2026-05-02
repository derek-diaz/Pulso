#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${script_dir}/plc-env.sh"

cd "${ROOT_DIR}"

version="${PULSO_VERSION:-0.1.0}"
deb_arch="${PULSO_DEB_ARCH:-$(dpkg --print-architecture)}"
package_root="${ROOT_DIR}/build/package/pulso_${version}_${deb_arch}"
deb_path="${ROOT_DIR}/build/bin/pulso_${version}_${deb_arch}.deb"

if ! command -v dpkg-deb >/dev/null 2>&1; then
  echo "Missing required tool: dpkg-deb" >&2
  exit 1
fi

"${script_dir}/build-plc.sh" -o Pulso

rm -rf "${package_root}"
mkdir -p \
  "${package_root}/DEBIAN" \
  "${package_root}/opt/Pulso/lib" \
  "${package_root}/usr/share/applications" \
  "${package_root}/usr/share/icons/hicolor/256x256/apps"

install -m 0755 "${ROOT_DIR}/build/bin/Pulso" "${package_root}/opt/Pulso/Pulso"
cp -a "${ROOT_DIR}/build/bin/lib"/libplctag.so* "${package_root}/opt/Pulso/lib/"
install -m 0644 "${ROOT_DIR}/build/appicon.png" "${package_root}/usr/share/icons/hicolor/256x256/apps/pulso.png"

cat >"${package_root}/usr/share/applications/pulso.desktop" <<'DESKTOP'
[Desktop Entry]
Type=Application
Name=Pulso
Comment=Local PLC state debugger
Exec=/opt/Pulso/Pulso
Icon=pulso
Terminal=false
Categories=Development;Engineering;
DESKTOP

installed_size="$(du -sk "${package_root}" | awk '{print $1}')"
cat >"${package_root}/DEBIAN/control" <<CONTROL
Package: pulso
Version: ${version}
Section: devel
Priority: optional
Architecture: ${deb_arch}
Maintainer: Derek Diaz <derek.diaz@plusonerobotics.com>
Depends: libc6, libgtk-3-0, libwebkit2gtk-4.1-0
Installed-Size: ${installed_size}
Description: Local PLC state debugger
 Pulso is a local-first desktop tool for debugging Allen-Bradley PLC state.
 This package includes the native libplctag runtime used by Pulso.
CONTROL

dpkg-deb --build --root-owner-group "${package_root}" "${deb_path}"
echo "Built ${deb_path}"
