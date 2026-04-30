#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/plc-env.sh"

cd "${ROOT_DIR}"
wails build -tags "webkit2_41,libplctag" "$@"

case "$(uname -s)" in
  Linux)
    output_name="Pulso"
    args=("$@")
    for ((i = 0; i < ${#args[@]}; i++)); do
      if [[ "${args[$i]}" == "-o" && $((i + 1)) -lt ${#args[@]} ]]; then
        output_name="${args[$((i + 1))]}"
      elif [[ "${args[$i]}" == -o=* ]]; then
        output_name="${args[$i]#-o=}"
      fi
    done

    binary_path="${ROOT_DIR}/build/bin/${output_name}"
    bundled_lib_dir="${ROOT_DIR}/build/bin/lib"

    if [[ ! -x "${binary_path}" ]]; then
      echo "Expected Wails binary not found at ${binary_path}" >&2
      exit 1
    fi

    mkdir -p "${bundled_lib_dir}"
    cp -a "${LIBPLCTAG_LIB_DIR}"/libplctag.so* "${bundled_lib_dir}/"
    echo "Bundled libplctag in ${bundled_lib_dir}"
    ;;
esac
