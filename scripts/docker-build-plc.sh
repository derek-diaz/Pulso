#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target="${1:-all}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required for containerized builds." >&2
  exit 1
fi

docker_run_workspace() {
  local image="$1"
  shift
  docker run --rm \
    --user "$(id -u):$(id -g)" \
    -e HOME=/tmp \
    -v "${ROOT_DIR}:/workspace" \
    -w /workspace \
    "${image}" \
    "$@"
}

build_linux_deb() {
  docker build \
    -f "${ROOT_DIR}/build/docker/linux-plc.Dockerfile" \
    -t pulso-build-linux-plc \
    "${ROOT_DIR}"
  docker_run_workspace \
    pulso-build-linux-plc \
    env \
    PULSO_DEPS_DIR=/workspace/.deps/docker-linux \
    LIBPLCTAG_PREFIX=/workspace/.deps/docker-linux/libplctag-install \
    ./scripts/package-linux-plc-deb.sh
}

build_windows_amd64() {
  docker build \
    -f "${ROOT_DIR}/build/docker/windows-plc.Dockerfile" \
    -t pulso-build-windows-plc \
    "${ROOT_DIR}"
  docker_run_workspace pulso-build-windows-plc ./scripts/build-windows-plc-docker.sh amd64
}

case "${target}" in
  linux-deb)
    build_linux_deb
    ;;
  windows-amd64)
    build_windows_amd64
    ;;
  all)
    build_linux_deb
    build_windows_amd64
    ;;
  *)
    echo "Usage: $0 [linux-deb|windows-amd64|all]" >&2
    exit 1
    ;;
esac
