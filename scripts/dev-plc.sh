#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/plc-env.sh"

cd "${ROOT_DIR}"
export PATH="${ROOT_DIR}/.deps/go-bin:${ROOT_DIR}/.deps/go/bin:${PATH}"

tags="libplctag"
if [[ "$(uname -s)" == "Linux" ]] && pkg-config --exists webkit2gtk-4.1; then
  tags="webkit2_41,${tags}"
fi

exec wails dev -tags "${tags}" "$@"
