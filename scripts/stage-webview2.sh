#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
arch="${1:-amd64}"
case "${arch}" in
  amd64|arm64) ;;
  *) echo "Unsupported Windows architecture: ${arch}" >&2; exit 1 ;;
esac
manifest="${ROOT_DIR}/build/windows/webview2-runtime.json"
version="$(jq -er '.version' "${manifest}")"
folder="$(jq -er --arg arch "${arch}" '.[$arch].folder' "${manifest}")"
url="$(jq -er --arg arch "${arch}" '.[$arch].url' "${manifest}")"
checksum="$(jq -er --arg arch "${arch}" '.[$arch].sha256' "${manifest}")"
[[ "${version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]
[[ "${folder}" =~ ^Microsoft\.WebView2\.FixedVersionRuntime\.[0-9.]+\.(x64|arm64)$ ]]

cache_dir="${ROOT_DIR}/.deps/webview2-fixed"
mkdir -p "${cache_dir}"
archive="${WEBVIEW2_ARCHIVE:-${cache_dir}/${folder}.cab}"
if [[ -z "${WEBVIEW2_ARCHIVE:-}" && ! -f "${archive}" ]]; then
  curl --fail --location --show-error --retry 3 --output "${archive}.download" "${url}"
  printf '%s  %s\n' "${checksum}" "${archive}.download" | sha256sum --check -
  mv "${archive}.download" "${archive}"
fi
printf '%s  %s\n' "${checksum}" "${archive}" | sha256sum --check -

staging_root="${ROOT_DIR}/build/windows/installer/resources/webview2-fixed"
target_dir="${staging_root}/${arch}"
rm -rf "${target_dir}"
mkdir -p "${target_dir}"
cabextract -q -d "${target_dir}" "${archive}"
test -f "${target_dir}/${folder}/msedgewebview2.exe"
printf '!define PULSO_WEBVIEW2_VERSION "%s"\n' "${version}" > "${staging_root}/version.nsh"
echo "Staged app-local WebView2 ${version} for ${arch}."
