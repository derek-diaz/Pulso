param(
    [ValidateSet("amd64", "arm64")]
    [string]$Arch = "amd64",
    [string]$LibPlcTagRoot = $env:LIBPLCTAG_ROOT
)

$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $RootDir

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
if (!(Test-Path $PkgConfigDir)) {
    throw "libplctag pkg-config directory not found: $PkgConfigDir"
}
if ($null -eq $DllPath) {
    throw "No libplctag runtime DLL found under $(Join-Path $LibPlcTagRoot "bin")"
}

$env:PKG_CONFIG_PATH = "$PkgConfigDir;$env:PKG_CONFIG_PATH"
$env:PATH = "$(Join-Path $LibPlcTagRoot "bin");$env:PATH"

$InstallerDllDir = Join-Path $RootDir "build\windows\installer\resources\plctag\$Arch"
New-Item -ItemType Directory -Force -Path $InstallerDllDir | Out-Null
Copy-Item -Force $DllPath (Join-Path $InstallerDllDir (Split-Path -Leaf $DllPath))

wails build -platform "windows/$Arch" -tags libplctag -nsis -webview2 embed
