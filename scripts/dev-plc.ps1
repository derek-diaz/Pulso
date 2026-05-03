param(
    [ValidateSet("amd64", "arm64")]
    [string]$Arch = "amd64",
    [string]$LibPlcTagRoot = $env:LIBPLCTAG_ROOT,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$WailsArgs
)

$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $RootDir

$LocalGoBin = Join-Path $RootDir ".deps\go-bin"
if (Test-Path $LocalGoBin) {
    $env:PATH = "$LocalGoBin;$env:PATH"
}

foreach ($Command in @("go", "npm", "pkg-config", "wails")) {
    if ($null -eq (Get-Command $Command -ErrorAction SilentlyContinue)) {
        throw "Required command not found on PATH: $Command"
    }
}

if ([string]::IsNullOrWhiteSpace($LibPlcTagRoot)) {
    $LibPlcTagRoot = Join-Path $RootDir ".deps\libplctag-windows-$Arch"
}

$PkgConfigDir = Join-Path $LibPlcTagRoot "lib\pkgconfig"
$PkgConfigFile = Join-Path $PkgConfigDir "libplctag.pc"
$DllPath = $null
foreach ($Name in @("libplctag.dll", "plctag.dll")) {
    $Candidate = Join-Path $LibPlcTagRoot "bin\$Name"
    if (Test-Path $Candidate) {
        $DllPath = $Candidate
        break
    }
}

if (!(Test-Path $PkgConfigFile)) {
    throw "libplctag pkg-config file not found: $PkgConfigFile"
}
if ($null -eq $DllPath) {
    throw "No libplctag runtime DLL found under $(Join-Path $LibPlcTagRoot "bin")"
}

$env:CGO_ENABLED = "1"
$env:PKG_CONFIG_PATH = "$PkgConfigDir;$env:PKG_CONFIG_PATH"
$env:PATH = "$(Join-Path $LibPlcTagRoot "bin");$env:PATH"

pkg-config --exists libplctag
if ($LASTEXITCODE -ne 0) {
    throw "pkg-config could not resolve libplctag using PKG_CONFIG_PATH=$env:PKG_CONFIG_PATH"
}

wails dev -tags libplctag @WailsArgs
