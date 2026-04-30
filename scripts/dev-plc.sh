#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/plc-env.sh"

cd "${ROOT_DIR}"
exec wails dev -tags "webkit2_41,libplctag" "$@"
