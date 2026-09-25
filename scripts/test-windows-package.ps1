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
$PreviousAppData = $env:APPDATA
$TempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$TestDir = Join-Path $TempRoot ("Pulso-runtime-test-" + [Guid]::NewGuid().ToString('N'))
$Process = $null
$ProbeProcess = $null
try {
    # WebView2 can reuse a browser process for the same user-data folder. Keep
    # this test independent of any Pulso instance and saved UI state on the PC.
    $env:APPDATA = Join-Path $TestDir 'profile'
    New-Item -ItemType Directory -Path $env:APPDATA -Force | Out-Null
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

    # A shared runtime must not conceal missing browser files in a release.
    # Use a copy with only Pulso and its native DLLs, leaving the installed
    # package and the machine's shared WebView2 installation untouched.
    $ProbeDir = Join-Path $TestDir 'without-browser'
    New-Item -ItemType Directory -Path $ProbeDir | Out-Null
    $ProbeBinary = Join-Path $ProbeDir (Split-Path -Leaf $BinaryPath)
    Copy-Item -LiteralPath $BinaryPath -Destination $ProbeBinary
    Get-ChildItem -LiteralPath $PackageDir -Filter '*.dll' -File | Copy-Item -Destination $ProbeDir
    $ErrorLog = Join-Path $ProbeDir 'startup-error.txt'
    $ProbeProcess = Start-Process -FilePath $ProbeBinary -WorkingDirectory $env:SystemRoot -WindowStyle Hidden -RedirectStandardError $ErrorLog -PassThru
    if (!$ProbeProcess.WaitForExit(10000)) {
        throw "Pulso kept running without its bundled browser; a shared runtime may be masking a broken package"
    }
    $ProbeProcess.WaitForExit() # Flush redirected stderr after process exit.
    $StartupError = Get-Content -LiteralPath $ErrorLog -Raw
    if (!$StartupError -or !$StartupError.Contains("Pulso's bundled browser files are missing or damaged.")) {
        throw "Expected the bundled-browser error, got: $StartupError"
    }
    Write-Host "Pulso rejected the incomplete package without falling back to a shared WebView2 runtime."
} finally {
    $env:PATH = $PreviousPath
    $env:APPDATA = $PreviousAppData
    foreach ($OwnedProcess in @($Process, $ProbeProcess)) {
        if ($null -ne $OwnedProcess -and !$OwnedProcess.HasExited) {
            Stop-Process -Id $OwnedProcess.Id -Force
            $OwnedProcess.WaitForExit()
        }
    }
    # Close only browsers using this test's unique profile, including any left
    # behind by a failed assertion. Do not stop a user's existing Pulso browser.
    Get-CimInstance Win32_Process -Filter "Name = 'msedgewebview2.exe'" |
        Where-Object { $_.CommandLine -and $_.CommandLine.Contains($TestDir) } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    # Restrict recursive cleanup to the uniquely named temporary test directory.
    $ResolvedTestDir = [IO.Path]::GetFullPath($TestDir)
    $ExpectedParent = $TempRoot.TrimEnd([IO.Path]::DirectorySeparatorChar)
    if ([IO.Path]::GetDirectoryName($ResolvedTestDir) -ne $ExpectedParent -or
        [IO.Path]::GetFileName($ResolvedTestDir) -notmatch '^Pulso-runtime-test-[0-9a-f]{32}$') {
        throw "Unsafe package test cleanup path: $ResolvedTestDir"
    }
    if (Test-Path -LiteralPath $ResolvedTestDir) { Remove-Item -LiteralPath $ResolvedTestDir -Recurse -Force }
}
