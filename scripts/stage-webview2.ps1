param(
    [ValidateSet("amd64", "arm64")]
    [string]$Arch = "amd64",
    [string]$Archive = $env:WEBVIEW2_ARCHIVE
)

$ErrorActionPreference = "Stop"
$RootDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Manifest = Get-Content (Join-Path $RootDir "build\windows\webview2-runtime.json") -Raw | ConvertFrom-Json
$Runtime = $Manifest.$Arch
if ($Manifest.version -notmatch '^\d+\.\d+\.\d+\.\d+$' -or $Runtime.folder -notmatch '^Microsoft\.WebView2\.FixedVersionRuntime\.[\d.]+\.(x64|arm64)$') {
    throw "Invalid fixed WebView2 runtime manifest"
}
$CacheDir = Join-Path $RootDir ".deps\webview2-fixed"
New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null
if ([string]::IsNullOrWhiteSpace($Archive)) {
    $Archive = Join-Path $CacheDir "$($Runtime.folder).cab"
    if (!(Test-Path -LiteralPath $Archive)) {
        $Pending = "$Archive.download"
        Invoke-WebRequest -Uri $Runtime.url -OutFile $Pending
        if ((Get-FileHash -LiteralPath $Pending -Algorithm SHA256).Hash -ne $Runtime.sha256) {
            throw "Downloaded WebView2 archive does not match the pinned SHA256"
        }
        Move-Item -LiteralPath $Pending -Destination $Archive -Force
    }
}
if ((Get-FileHash -LiteralPath $Archive -Algorithm SHA256).Hash -ne $Runtime.sha256) {
    throw "WebView2 archive does not match the pinned $Arch runtime SHA256: $Archive"
}
$Archive = (Resolve-Path -LiteralPath $Archive).Path

$StagingRoot = [IO.Path]::GetFullPath((Join-Path $RootDir "build\windows\installer\resources\webview2-fixed"))
$TargetDir = [IO.Path]::GetFullPath((Join-Path $StagingRoot $Arch))
# Extract a complete, clean tree; never mix files from different runtime builds.
if (!$TargetDir.StartsWith("$StagingRoot\", [StringComparison]::OrdinalIgnoreCase)) {
    throw "Unsafe WebView2 staging directory: $TargetDir"
}
if (Test-Path -LiteralPath $TargetDir) { Remove-Item -LiteralPath $TargetDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
& "$env:SystemRoot\System32\expand.exe" '-F:*' $Archive $TargetDir | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Failed to expand fixed WebView2 runtime" }
$Browser = Join-Path $TargetDir "$($Runtime.folder)\msedgewebview2.exe"
$Signature = Get-AuthenticodeSignature -LiteralPath $Browser
if ($Signature.Status -ne 'Valid' -or $Signature.SignerCertificate.Subject -notmatch '(^|, )O=Microsoft Corporation(,|$)') {
    throw "Fixed WebView2 runtime must have a valid Microsoft signature: $Browser"
}
Set-Content -LiteralPath (Join-Path $StagingRoot "version.nsh") -Encoding ascii -Value ('!define PULSO_WEBVIEW2_VERSION "' + $Manifest.version + '"')
Write-Host "Staged app-local WebView2 $($Manifest.version) for $Arch."
