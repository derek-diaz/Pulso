param(
    [ValidateSet("amd64", "arm64")]
    [string]$Arch = "amd64",
    [string]$LibPlcTagRoot = $env:LIBPLCTAG_ROOT
)

$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $RootDir

$LocalGoBin = Join-Path $RootDir ".deps\go-bin"
$env:PATH = "$LocalGoBin;$env:PATH"
foreach ($Command in @("go", "wails", "makensis")) {
    if ($null -eq (Get-Command $Command -ErrorAction SilentlyContinue)) {
        throw "Required command not found on PATH: $Command. See README.md for Windows build prerequisites."
    }
}

if ([string]::IsNullOrWhiteSpace($LibPlcTagRoot)) {
    $LibPlcTagRoot = Join-Path $RootDir ".deps\libplctag-windows-$Arch"
}

$PkgConfigDir = Join-Path $LibPlcTagRoot "lib\pkgconfig"
$DllPath = $null
foreach ($Name in @("libplctag.dll", "plctag.dll")) {
    $Candidate = Join-Path $LibPlcTagRoot "bin\$Name"
    if (Test-Path $Candidate) {
        $DllPath = $Candidate
        break
    }
}
if (!(Test-Path (Join-Path $PkgConfigDir "libplctag.pc"))) {
    throw "libplctag pkg-config file not found under: $PkgConfigDir"
}
if ($null -eq $DllPath) {
    throw "No libplctag runtime DLL found under $(Join-Path $LibPlcTagRoot "bin")"
}

$env:PKG_CONFIG_PATH = "$PkgConfigDir;$env:PKG_CONFIG_PATH"
$env:PATH = "$(Join-Path $LibPlcTagRoot "bin");$env:PATH"
$env:CGO_ENABLED = "1"

# Build the packaging tool for the host, even when targeting Windows ARM64.
$RuntimeTool = Join-Path $RootDir ".deps\windows-runtime.exe"
$PreviousGOOS = $env:GOOS
$PreviousGOARCH = $env:GOARCH
try {
    $env:GOOS = go env GOHOSTOS
    $env:GOARCH = go env GOHOSTARCH
    go build -o $RuntimeTool ./tools/windows-runtime
    if ($LASTEXITCODE -ne 0) { throw "Failed to build Windows runtime packaging tool" }
} finally {
    $env:GOOS = $PreviousGOOS
    $env:GOARCH = $PreviousGOARCH
}
$Compiler = go env CC

$InstallerDllDir = Join-Path $RootDir "build\windows\installer\resources\plctag\$Arch"
& $RuntimeTool -root $DllPath -dest $InstallerDllDir -arch $Arch -cc $Compiler
if ($LASTEXITCODE -ne 0) { throw "Failed to stage Windows runtime dependencies" }
$env:PATH = "$InstallerDllDir;$env:PATH"

& (Join-Path $PSScriptRoot "stage-webview2.ps1") -Arch $Arch
wails build -platform "windows/$Arch" -tags libplctag -nsis -webview2 error -o "Pulso-windows-$Arch-plc.exe"
if ($LASTEXITCODE -ne 0) { throw "Wails Windows build failed" }

$BinaryPath = Join-Path $RootDir "build\bin\Pulso-windows-$Arch-plc.exe"
& $RuntimeTool -root $BinaryPath -dest $InstallerDllDir -arch $Arch -verify
if ($LASTEXITCODE -ne 0) { throw "Windows executable has unpackaged runtime dependencies" }

# Keep the loose executable runnable too; these DLLs also ship in the installer.
Copy-Item -Path (Join-Path $InstallerDllDir "*.dll") -Destination (Join-Path $RootDir "build\bin") -Force
$Manifest = Get-Content (Join-Path $RootDir "build\windows\webview2-runtime.json") -Raw | ConvertFrom-Json
$BrowserSource = Join-Path $RootDir "build\windows\installer\resources\webview2-fixed\$Arch\$($Manifest.$Arch.folder)"
$BrowserTarget = Join-Path $RootDir "build\bin\WebView2\$($Manifest.version)"
New-Item -ItemType Directory -Force -Path $BrowserTarget | Out-Null
Copy-Item -Path "$BrowserSource\*" -Destination $BrowserTarget -Recurse -Force
