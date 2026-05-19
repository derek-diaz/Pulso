#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ADDRESS="${1:-127.0.0.1:44818}"
PROFILE="${2:-emulator/profiles/sample-logix.json}"

cd "${ROOT_DIR}"
export GOCACHE="${ROOT_DIR}/.deps/go-build"
go run -buildvcs=false ./cmd/pulso-plc-emulator -addr "${ADDRESS}" -profile "${PROFILE}"
