#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPS_DIR="${PULSO_DEPS_DIR:-${ROOT_DIR}/.deps}"
WAILS_VERSION="${WAILS_VERSION:-v2.10.0}"

if ! xcode-select -p >/dev/null 2>&1; then
  echo "Installing Xcode Command Line Tools. Re-run this script after the installer finishes."
  xcode-select --install
  exit 1
fi

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew is required for the macOS bootstrap: https://brew.sh" >&2
  exit 1
fi

brew install go node cmake pkg-config

mkdir -p "${DEPS_DIR}/go-bin"
GOBIN="${DEPS_DIR}/go-bin" go install "github.com/wailsapp/wails/v2/cmd/wails@${WAILS_VERSION}"

cd "${ROOT_DIR}"
npm --prefix frontend install
bash "${ROOT_DIR}/scripts/setup-libplctag.sh"

echo
echo "Pulso macOS development environment is ready."
echo "Run: bash scripts/dev-plc.sh"
