#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPS_DIR="${PULSO_DEPS_DIR:-${ROOT_DIR}/.deps}"
GO_VERSION="${GO_VERSION:-1.23.10}"
WAILS_VERSION="${WAILS_VERSION:-v2.10.0}"

install_project_go() {
  local go_root="${DEPS_DIR}/go"
  local go_bin="${go_root}/bin/go"
  if [[ -x "${go_bin}" ]] && "${go_bin}" version | grep -q "go${GO_VERSION}"; then
    export PATH="${go_root}/bin:${PATH}"
    return
  fi

  local machine goarch archive_path
  machine="$(uname -m)"
  case "${machine}" in
    x86_64|amd64) goarch="amd64" ;;
    aarch64|arm64) goarch="arm64" ;;
    *) echo "Unsupported Linux architecture for Go bootstrap: ${machine}" >&2; exit 1 ;;
  esac

  mkdir -p "${DEPS_DIR}"
  archive_path="${DEPS_DIR}/go${GO_VERSION}.linux-${goarch}.tar.gz"
  if [[ ! -f "${archive_path}" ]]; then
    curl --fail --location --show-error \
      --output "${archive_path}" \
      "https://go.dev/dl/go${GO_VERSION}.linux-${goarch}.tar.gz"
  fi
  rm -rf "${go_root}"
  tar -C "${DEPS_DIR}" -xzf "${archive_path}"
  export PATH="${go_root}/bin:${PATH}"
}

install_packages() {
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update
    sudo apt-get install -y --no-install-recommends \
      build-essential \
      ca-certificates \
      cmake \
      curl \
      git \
      libgtk-3-dev \
      npm \
      pkg-config \
      tar

    if apt-cache show libwebkit2gtk-4.1-dev >/dev/null 2>&1; then
      sudo apt-get install -y --no-install-recommends libwebkit2gtk-4.1-dev
    else
      sudo apt-get install -y --no-install-recommends libwebkit2gtk-4.0-dev
    fi
    return
  fi

  if command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y \
      cmake \
      curl \
      gcc \
      gcc-c++ \
      git \
      gtk3-devel \
      nodejs \
      npm \
      pkgconf-pkg-config \
      tar \
      webkit2gtk4.1-devel
    return
  fi

  if command -v pacman >/dev/null 2>&1; then
    sudo pacman -Syu --needed --noconfirm \
      base-devel \
      cmake \
      curl \
      git \
      gtk3 \
      nodejs \
      npm \
      pkgconf \
      tar \
      webkit2gtk
    return
  fi

  echo "Unsupported Linux package manager. Install Go 1.23+, Node/npm, Wails dependencies, cmake, curl, pkg-config, tar, and a C compiler, then rerun." >&2
  exit 1
}

install_packages
install_project_go

mkdir -p "${DEPS_DIR}/go-bin"
GOBIN="${DEPS_DIR}/go-bin" go install "github.com/wailsapp/wails/v2/cmd/wails@${WAILS_VERSION}"

cd "${ROOT_DIR}"
npm --prefix frontend install
bash "${ROOT_DIR}/scripts/setup-libplctag.sh"

echo
echo "Pulso Linux development environment is ready."
echo "Run: bash scripts/dev-plc.sh"
