#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPS_DIR="${ROOT_DIR}/.deps"
LIBPLCTAG_VERSION="${LIBPLCTAG_VERSION:-2.6.16}"
LIBPLCTAG_VERSION="${LIBPLCTAG_VERSION#v}"
LIBPLCTAG_TAG="v${LIBPLCTAG_VERSION}"

arch="${1:-amd64}"
if [[ "${arch}" != "amd64" ]]; then
  echo "Only windows/amd64 is currently supported by the Docker cross-build image." >&2
  echo "Build Windows ARM64 from Windows with scripts/build-windows-plc.ps1 and an ARM64 libplctag root." >&2
  exit 1
fi

for tool in cmake curl makensis npm pkg-config tar wails x86_64-w64-mingw32-g++ x86_64-w64-mingw32-gcc x86_64-w64-mingw32-windres; do
  if ! command -v "${tool}" >/dev/null 2>&1; then
    echo "Missing required tool: ${tool}" >&2
    exit 1
  fi
done

prefix="${LIBPLCTAG_WINDOWS_PREFIX:-${DEPS_DIR}/libplctag-windows-${arch}}"
pkg_config_dir="${prefix}/lib/pkgconfig"
expected_dll_path="${prefix}/bin/libplctag.dll"

build_libplctag_windows() {
  mkdir -p "${DEPS_DIR}"

  local archive_path="${DEPS_DIR}/libplctag-${LIBPLCTAG_VERSION}.tar.gz"
  local source_dir="${DEPS_DIR}/libplctag-src-${LIBPLCTAG_VERSION}"
  local build_dir="${DEPS_DIR}/libplctag-build-windows-${arch}-${LIBPLCTAG_VERSION}"
  local tmp_extract_dir="${DEPS_DIR}/libplctag-extract-${LIBPLCTAG_VERSION}"
  local download_url="https://github.com/libplctag/libplctag/archive/refs/tags/${LIBPLCTAG_TAG}.tar.gz"

  if [[ ! -f "${archive_path}" ]]; then
    echo "Downloading libplctag ${LIBPLCTAG_TAG}..."
    curl --fail --location --show-error --output "${archive_path}" "${download_url}"
  fi

  if [[ ! -d "${source_dir}" ]]; then
    echo "Extracting libplctag ${LIBPLCTAG_TAG}..."
    rm -rf "${tmp_extract_dir}"
    mkdir -p "${tmp_extract_dir}"
    tar -xzf "${archive_path}" -C "${tmp_extract_dir}" --strip-components=1
    mv "${tmp_extract_dir}" "${source_dir}"
  fi

  echo "Building Windows libplctag ${LIBPLCTAG_TAG}..."
  rm -rf "${build_dir}"
  cmake -S "${source_dir}" -B "${build_dir}" \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_SYSTEM_NAME=Windows \
    -DCMAKE_C_COMPILER=x86_64-w64-mingw32-gcc \
    -DCMAKE_CXX_COMPILER=x86_64-w64-mingw32-g++ \
    -DCMAKE_RC_COMPILER=x86_64-w64-mingw32-windres \
    -DCMAKE_INSTALL_PREFIX="${prefix}" \
    -DBUILD_EXAMPLES=OFF \
    -DBUILD_TESTS=OFF \
    -DBUILD_SHARED_LIBS=ON

  local parallel_jobs
  parallel_jobs="$(getconf _NPROCESSORS_ONLN 2>/dev/null || printf '2')"
  cmake --build "${build_dir}" --parallel "${parallel_jobs}"

  mkdir -p "${prefix}/bin" "${prefix}/lib/pkgconfig" "${prefix}/include"
  rm -f "${prefix}/bin"/*plctag*.dll
  cp "${source_dir}/src/libplctag/lib/libplctag.h" "${prefix}/include/"
  cp "${build_dir}/bin_dist/libplctag.pc" "${prefix}/lib/pkgconfig/"
  find "${build_dir}/bin_dist" -maxdepth 1 -type f \( -name "*.dll.a" -o -name "*.a" \) -exec cp {} "${prefix}/lib/" \;

  local built_dll
  built_dll="$(find "${build_dir}/bin_dist" -maxdepth 1 -type f -iname "plctag.dll" -print -quit)"
  if [[ -z "${built_dll}" ]]; then
    built_dll="$(find "${build_dir}/bin_dist" -maxdepth 1 -type f -iname "*plctag*.dll" -print -quit)"
  fi
  if [[ -z "${built_dll}" ]]; then
    echo "libplctag built, but no Windows DLL was found in ${build_dir}/bin_dist" >&2
    exit 1
  fi
  cp "${built_dll}" "${prefix}/bin/$(basename "${built_dll}")"
}

if [[ ! -f "${pkg_config_dir}/libplctag.pc" || ! -f "${expected_dll_path}" ]]; then
  build_libplctag_windows
fi

if [[ ! -f "${pkg_config_dir}/libplctag.pc" || ! -f "${expected_dll_path}" ]]; then
  echo "Windows libplctag staging failed under ${prefix}" >&2
  exit 1
fi

cd "${ROOT_DIR}"
installer_dll_dir="${ROOT_DIR}/build/windows/installer/resources/plctag/${arch}"
mkdir -p "${installer_dll_dir}"
cp "${expected_dll_path}" "${installer_dll_dir}/libplctag.dll"

export CC=x86_64-w64-mingw32-gcc
export CGO_ENABLED=1
export GOOS=windows
export GOARCH=amd64
export PKG_CONFIG_ALLOW_CROSS=1
export PKG_CONFIG_PATH="${pkg_config_dir}${PKG_CONFIG_PATH:+:${PKG_CONFIG_PATH}}"
export PATH="${prefix}/bin:${PATH}"
export GOCACHE="${GOCACHE:-${DEPS_DIR}/go-build-windows-${arch}}"

set +e
wails build \
  -platform windows/amd64 \
  -tags libplctag \
  -nsis \
  -webview2 embed \
  -skipbindings \
  -o Pulso-windows-${arch}-plc.exe
wails_status=$?
set -e

installer_path="${ROOT_DIR}/build/bin/Pulso-${arch}-installer.exe"
binary_path="${ROOT_DIR}/build/bin/Pulso-windows-${arch}-plc.exe"
if [[ "${wails_status}" -ne 0 ]]; then
  if [[ -f "${installer_path}" && -f "${binary_path}" ]]; then
    echo "Wails returned ${wails_status} after producing ${installer_path}; keeping generated installer."
  else
    exit "${wails_status}"
  fi
fi
