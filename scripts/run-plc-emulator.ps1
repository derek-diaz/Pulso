param(
    [string]$Address = "127.0.0.1:44818",
    [string]$Profile = "emulator/profiles/sample-logix.json"
)

$ErrorActionPreference = "Stop"
$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")

Push-Location $RootDir
try {
    $env:GOCACHE = Join-Path $RootDir ".deps\go-build"
    go run -buildvcs=false ./cmd/pulso-plc-emulator -addr $Address -profile $Profile
}
finally {
    Pop-Location
}
