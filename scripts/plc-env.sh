#!/usr/bin/env bash

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "scripts/plc-env.sh must be sourced, not executed directly" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIBPLCTAG_PREFIX="${ROOT_DIR}/.deps/libplctag-install"
LIBPLCTAG_LIB_DIR="${LIBPLCTAG_PREFIX}/lib"
LIBPLCTAG_PKG_CONFIG_DIR="${LIBPLCTAG_LIB_DIR}/pkgconfig"

if [[ ! -f "${LIBPLCTAG_PKG_CONFIG_DIR}/libplctag.pc" ]]; then
  if [[ "${PULSO_LIBPLCTAG_AUTO_SETUP:-1}" != "0" ]]; then
    bash "${ROOT_DIR}/scripts/setup-libplctag.sh" || return 1
  fi

  if [[ ! -f "${LIBPLCTAG_PKG_CONFIG_DIR}/libplctag.pc" ]]; then
    echo "libplctag is not installed at ${LIBPLCTAG_PREFIX}" >&2
    echo "Run ./scripts/setup-libplctag.sh, or set PULSO_LIBPLCTAG_AUTO_SETUP=1 and rerun the PLC-enabled app." >&2
    return 1
  fi
fi

export PKG_CONFIG_PATH="${LIBPLCTAG_PKG_CONFIG_DIR}${PKG_CONFIG_PATH:+:${PKG_CONFIG_PATH}}"
export LD_LIBRARY_PATH="${LIBPLCTAG_LIB_DIR}${LD_LIBRARY_PATH:+:${LD_LIBRARY_PATH}}"
export GOCACHE="${GOCACHE:-${ROOT_DIR}/.deps/go-build}"
if [[ "${GOMODCACHE:-}" == "${ROOT_DIR}/.deps/go-mod" ]]; then
  unset GOMODCACHE
fi

# Let installed Linux app folders resolve bundled native libraries beside the binary.
case "$(uname -s)" in
  Linux)
    export CGO_LDFLAGS="${CGO_LDFLAGS:-} -Wl,-rpath,\$ORIGIN/lib"
    if [[ -n "${CGO_LDFLAGS_ALLOW:-}" ]]; then
      export CGO_LDFLAGS_ALLOW="${CGO_LDFLAGS_ALLOW}|-Wl,-rpath,.*"
    else
      export CGO_LDFLAGS_ALLOW="-Wl,-rpath,.*"
    fi
    ;;
esac
