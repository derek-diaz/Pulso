#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPS_DIR="${ROOT_DIR}/.deps"
LIBPLCTAG_VERSION="${LIBPLCTAG_VERSION:-2.6.16}"
LIBPLCTAG_VERSION="${LIBPLCTAG_VERSION#v}"
LIBPLCTAG_TAG="v${LIBPLCTAG_VERSION}"
LIBPLCTAG_PREFIX="${LIBPLCTAG_PREFIX:-${DEPS_DIR}/libplctag-install}"
LIBPLCTAG_PKG_CONFIG_DIR="${LIBPLCTAG_PREFIX}/lib/pkgconfig"
LIBPLCTAG_PC="${LIBPLCTAG_PKG_CONFIG_DIR}/libplctag.pc"

if [[ -f "${LIBPLCTAG_PC}" ]]; then
  echo "libplctag is already installed at ${LIBPLCTAG_PREFIX}"
  exit 0
fi

for tool in cc cmake curl pkg-config tar; do
  if ! command -v "${tool}" >/dev/null 2>&1; then
    echo "Missing required tool: ${tool}" >&2
    echo "Install ${tool}, then rerun this script." >&2
    exit 1
  fi
done

mkdir -p "${DEPS_DIR}"

archive_path="${DEPS_DIR}/libplctag-${LIBPLCTAG_VERSION}.tar.gz"
source_dir="${DEPS_DIR}/libplctag-src-${LIBPLCTAG_VERSION}"
build_dir="${DEPS_DIR}/libplctag-build-${LIBPLCTAG_VERSION}"
tmp_extract_dir="${DEPS_DIR}/libplctag-extract-${LIBPLCTAG_VERSION}"
download_url="https://github.com/libplctag/libplctag/archive/refs/tags/${LIBPLCTAG_TAG}.tar.gz"

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

echo "Building libplctag ${LIBPLCTAG_TAG}..."
cmake -S "${source_dir}" -B "${build_dir}" \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_INSTALL_PREFIX="${LIBPLCTAG_PREFIX}" \
  -DBUILD_EXAMPLES=OFF \
  -DBUILD_TESTS=OFF \
  -DBUILD_SHARED_LIBS=ON

parallel_jobs="$(getconf _NPROCESSORS_ONLN 2>/dev/null || printf '2')"
cmake --build "${build_dir}" --target install --parallel "${parallel_jobs}"

if [[ ! -f "${LIBPLCTAG_PC}" ]]; then
  echo "libplctag built, but ${LIBPLCTAG_PC} was not created." >&2
  exit 1
fi

echo "Installed libplctag ${LIBPLCTAG_TAG} at ${LIBPLCTAG_PREFIX}"
