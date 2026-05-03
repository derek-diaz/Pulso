param(
    [ValidateSet("amd64", "arm64")]
    [string]$Arch = "amd64",
    [string]$LibPlcTagVersion = "2.6.16",
    [switch]$SkipPackageInstall
)

$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$DepsDir = Join-Path $RootDir ".deps"
$GoBinDir = Join-Path $DepsDir "go-bin"
$InstallPrefix = Join-Path $DepsDir "libplctag-windows-$Arch"
$PkgConfigFile = Join-Path $InstallPrefix "lib\pkgconfig\libplctag.pc"
$ExpectedDll = Join-Path $InstallPrefix "bin\libplctag.dll"
$WailsVersion = if ($env:WAILS_VERSION) { $env:WAILS_VERSION } else { "v2.10.0" }

function Add-PathEntry {
    param([string]$PathEntry)

    if ([string]::IsNullOrWhiteSpace($PathEntry) -or !(Test-Path $PathEntry)) {
        return
    }

    $parts = $env:PATH -split ';' | Where-Object { $_ }
    if ($parts -notcontains $PathEntry) {
        $env:PATH = "$PathEntry;$env:PATH"
    }

    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $userParts = $userPath -split ';' | Where-Object { $_ }
    if ($userParts -notcontains $PathEntry) {
        $nextUserPath = if ([string]::IsNullOrWhiteSpace($userPath)) { $PathEntry } else { "$PathEntry;$userPath" }
        [Environment]::SetEnvironmentVariable("Path", $nextUserPath, "User")
    }
}

function Install-WingetPackage {
    param(
        [string]$Id,
        [string]$Name
    )

    if ($SkipPackageInstall) {
        return
    }
    if ($null -eq (Get-Command winget -ErrorAction SilentlyContinue)) {
        throw "winget is required to bootstrap $Name. Install it or rerun with -SkipPackageInstall after installing prerequisites manually."
    }

    winget install --id $Id --exact --accept-package-agreements --accept-source-agreements
}

function Find-MsysRoot {
    foreach ($Path in @($env:MSYS2_ROOT, "C:\msys64")) {
        if (![string]::IsNullOrWhiteSpace($Path) -and (Test-Path (Join-Path $Path "usr\bin\bash.exe"))) {
            return $Path
        }
    }
    return $null
}

function Assert-UnderDirectory {
    param(
        [string]$Path,
        [string]$Parent
    )

    $FullPath = [System.IO.Path]::GetFullPath($Path)
    $FullParent = [System.IO.Path]::GetFullPath($Parent)
    if (!$FullParent.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {
        $FullParent = "$FullParent$([System.IO.Path]::DirectorySeparatorChar)"
    }
    if (!$FullPath.StartsWith($FullParent, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove path outside dependency directory: $FullPath"
    }
}

function Remove-DependencyDirectory {
    param([string]$Path)

    if (Test-Path $Path) {
        Assert-UnderDirectory -Path $Path -Parent $DepsDir
        Remove-Item -Recurse -Force $Path
    }
}

Install-WingetPackage -Id "GoLang.Go" -Name "Go"
Install-WingetPackage -Id "OpenJS.NodeJS.LTS" -Name "Node.js"
Install-WingetPackage -Id "MSYS2.MSYS2" -Name "MSYS2"

Add-PathEntry "C:\Program Files\Go\bin"
Add-PathEntry "C:\Program Files\nodejs"
Add-PathEntry (Join-Path $HOME "go\bin")
New-Item -ItemType Directory -Force -Path $GoBinDir | Out-Null
Add-PathEntry $GoBinDir

$MsysRoot = Find-MsysRoot
if ($null -eq $MsysRoot) {
    throw "MSYS2 was not found. Install MSYS2 or set MSYS2_ROOT to its install directory."
}

$MsysPrefix = if ($Arch -eq "arm64") { Join-Path $MsysRoot "clangarm64" } else { Join-Path $MsysRoot "ucrt64" }
$MsysBin = Join-Path $MsysPrefix "bin"
$MsysUsrBin = Join-Path $MsysRoot "usr\bin"
$MsysBash = Join-Path $MsysUsrBin "bash.exe"

Add-PathEntry $MsysBin
Add-PathEntry $MsysUsrBin

if (!$SkipPackageInstall) {
    $MsysPackages = if ($Arch -eq "arm64") {
        "mingw-w64-clang-aarch64-gcc mingw-w64-clang-aarch64-cmake mingw-w64-clang-aarch64-ninja mingw-w64-clang-aarch64-pkgconf"
    } else {
        "mingw-w64-ucrt-x86_64-gcc mingw-w64-ucrt-x86_64-cmake mingw-w64-ucrt-x86_64-ninja mingw-w64-ucrt-x86_64-pkgconf"
    }
    & $MsysBash -lc "pacman -Syu --needed --noconfirm $MsysPackages tar"
    if ($LASTEXITCODE -ne 0) {
        throw "MSYS2 package installation failed"
    }
}

Add-PathEntry $MsysBin
Add-PathEntry $MsysUsrBin

foreach ($Command in @("go", "npm", "cmake", "ninja", "pkg-config", "gcc", "tar")) {
    if ($null -eq (Get-Command $Command -ErrorAction SilentlyContinue)) {
        throw "Required command not found after bootstrap: $Command. Expected MSYS2 tools under $MsysBin. Open a new PowerShell window and rerun this script; if it still fails, run '$MsysBash -lc ""pacman -Syu --needed --noconfirm $MsysPackages tar""'."
    }
}

$env:GOBIN = $GoBinDir
go install "github.com/wailsapp/wails/v2/cmd/wails@$WailsVersion"
if ($LASTEXITCODE -ne 0) {
    throw "Failed to install Wails CLI"
}

$FrontendDir = Join-Path $RootDir "frontend"
npm --prefix $FrontendDir install
if ($LASTEXITCODE -ne 0) {
    throw "Failed to install frontend dependencies"
}

if (!(Test-Path $PkgConfigFile) -or !(Test-Path $ExpectedDll)) {
    New-Item -ItemType Directory -Force -Path $DepsDir | Out-Null

    $Version = $LibPlcTagVersion.TrimStart("v")
    $Tag = "v$Version"
    $ArchivePath = Join-Path $DepsDir "libplctag-$Version.tar.gz"
    $SourceDir = Join-Path $DepsDir "libplctag-src-$Version"
    $BuildDir = Join-Path $DepsDir "libplctag-build-windows-$Arch-$Version"
    $ExtractDir = Join-Path $DepsDir "libplctag-extract-$Version"
    $DownloadUrl = "https://github.com/libplctag/libplctag/archive/refs/tags/$Tag.tar.gz"
    $WindowsTar = Join-Path $env:WINDIR "System32\tar.exe"
    $SourceCMakeLists = Join-Path $SourceDir "CMakeLists.txt"

    if (!(Test-Path $ArchivePath)) {
        Invoke-WebRequest -Uri $DownloadUrl -OutFile $ArchivePath
    }

    if ((Test-Path $SourceDir) -and !(Test-Path $SourceCMakeLists)) {
        Remove-DependencyDirectory -Path $SourceDir
    }

    if (!(Test-Path $SourceCMakeLists)) {
        Remove-DependencyDirectory -Path $ExtractDir
        New-Item -ItemType Directory -Force -Path $ExtractDir | Out-Null
        if (!(Test-Path $WindowsTar)) {
            throw "Windows tar was not found at $WindowsTar"
        }
        & $WindowsTar -xzf $ArchivePath -C $ExtractDir --strip-components=1
        if ($LASTEXITCODE -ne 0) {
            Remove-DependencyDirectory -Path $ExtractDir
            throw "Failed to extract $ArchivePath"
        }
        if (!(Test-Path (Join-Path $ExtractDir "CMakeLists.txt"))) {
            Remove-DependencyDirectory -Path $ExtractDir
            throw "Extracted libplctag archive did not contain CMakeLists.txt. Delete $ArchivePath and rerun setup if the archive is corrupt."
        }
        Move-Item -Path $ExtractDir -Destination $SourceDir
    }

    Remove-DependencyDirectory -Path $BuildDir

    cmake -S $SourceDir -B $BuildDir -G Ninja `
        -DCMAKE_BUILD_TYPE=Release `
        -DCMAKE_INSTALL_PREFIX=$InstallPrefix `
        -DBUILD_EXAMPLES=OFF `
        -DBUILD_TESTS=OFF `
        -DBUILD_SHARED_LIBS=ON
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to configure libplctag"
    }

    cmake --build $BuildDir --parallel
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to build libplctag"
    }

    New-Item -ItemType Directory -Force -Path (Join-Path $InstallPrefix "bin"), (Join-Path $InstallPrefix "lib\pkgconfig"), (Join-Path $InstallPrefix "include") | Out-Null
    Copy-Item -Force (Join-Path $SourceDir "src\libplctag\lib\libplctag.h") (Join-Path $InstallPrefix "include\libplctag.h")
    Copy-Item -Force (Join-Path $BuildDir "bin_dist\libplctag.pc") $PkgConfigFile

    Get-ChildItem (Join-Path $BuildDir "bin_dist") -File |
        Where-Object { $_.Name -like "*.dll.a" -or $_.Name -like "*.a" } |
        Copy-Item -Destination (Join-Path $InstallPrefix "lib") -Force

    $BuiltDll = Get-ChildItem (Join-Path $BuildDir "bin_dist") -File -Filter "*plctag*.dll" | Select-Object -First 1
    if ($null -eq $BuiltDll) {
        throw "libplctag built, but no DLL was found under $(Join-Path $BuildDir "bin_dist")"
    }
    Copy-Item -Force $BuiltDll.FullName $ExpectedDll
}

if (!(Test-Path $PkgConfigFile) -or !(Test-Path $ExpectedDll)) {
    throw "Windows libplctag staging failed under $InstallPrefix"
}

Write-Host ""
Write-Host "Pulso Windows development environment is ready."
Write-Host "Run: .\scripts\dev-plc.ps1"
