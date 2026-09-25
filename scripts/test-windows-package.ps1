param(
    [Parameter(Mandatory = $true)]
    [string]$PackageDir,
    [ValidateSet("amd64", "arm64")]
    [string]$Arch = "amd64",
    [string]$Executable = "Pulso.exe"
)

$ErrorActionPreference = "Stop"
$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$PackageDir = (Resolve-Path -LiteralPath $PackageDir).Path
$BinaryPath = Join-Path $PackageDir $Executable
if (!(Test-Path -LiteralPath $BinaryPath)) {
    throw "Packaged executable not found: $BinaryPath"
}
$Manifest = Get-Content (Join-Path $RootDir "build\windows\webview2-runtime.json") -Raw | ConvertFrom-Json
$BrowserPath = Join-Path $PackageDir "WebView2\$($Manifest.version)\msedgewebview2.exe"
$Signature = Get-AuthenticodeSignature -LiteralPath $BrowserPath
if ($Signature.Status -ne 'Valid' -or $Signature.SignerCertificate.Subject -notmatch '(^|, )O=Microsoft Corporation(,|$)') {
    throw "Packaged WebView2 runtime is missing or lacks a valid Microsoft signature"
}
if ((Get-Item -LiteralPath $BrowserPath).VersionInfo.FileVersion -ne $Manifest.version) {
    throw "Packaged WebView2 runtime does not match the pinned version"
}

Push-Location $RootDir
try {
    go run ./tools/windows-runtime -root $BinaryPath -dest $PackageDir -arch $Arch -verify
    if ($LASTEXITCODE -ne 0) { throw "Package has missing or incompatible runtime DLLs" }
} finally {
    Pop-Location
}

# Do not let a development toolchain on PATH hide a broken installer.
# MainWindowTitle ignores hidden windows; enumerate this process's windows so
# the check also works when launched hidden on a CI runner.
if (!("PulsoPackageSmokeTest" -as [type])) {
    Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class PulsoPackageSmokeTest {
    private delegate bool Callback(IntPtr window, IntPtr parameter);
    [DllImport("user32.dll")]
    private static extern bool EnumWindows(Callback callback, IntPtr parameter);
    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr window, StringBuilder text, int length);
    public static bool HasAppWindow(uint processId) {
        bool found = false;
        EnumWindows((window, parameter) => {
            uint owner;
            GetWindowThreadProcessId(window, out owner);
            if (owner == processId) {
                var title = new StringBuilder(256);
                GetWindowText(window, title, title.Capacity);
                found = title.ToString() == "Pulso";
            }
            return !found;
        }, IntPtr.Zero);
        return found;
    }
}
'@
}
$PreviousPath = $env:PATH
$Process = $null
try {
    $env:PATH = "$env:SystemRoot\System32;$env:SystemRoot"
    # Launch from a different directory to exercise executable-relative loading.
    $Process = Start-Process -FilePath $BinaryPath -WorkingDirectory $env:SystemRoot -WindowStyle Hidden -PassThru
    if ($Process.WaitForExit(10000)) {
        throw "Pulso exited during startup with code $($Process.ExitCode)"
    }
    $Process.Refresh()
    if (![PulsoPackageSmokeTest]::HasAppWindow($Process.Id)) {
        throw "Pulso did not create its application window"
    }
    $Browsers = @(Get-CimInstance Win32_Process -Filter "Name = 'msedgewebview2.exe'" |
        Where-Object { $_.ExecutablePath -eq $BrowserPath })
    if (!($Browsers | Where-Object { $_.ParentProcessId -eq $Process.Id })) {
        throw "Pulso did not launch its own bundled WebView2 runtime"
    }
    if (!($Browsers | Where-Object { $_.CommandLine -match '--type=renderer' })) {
        throw "Bundled WebView2 did not start a renderer"
    }
    Write-Host "Pulso opened with its bundled WebView2 renderer and only Windows system directories on PATH."
} finally {
    $env:PATH = $PreviousPath
    if ($null -ne $Process -and !$Process.HasExited) {
        Stop-Process -Id $Process.Id -Force
    }
}
