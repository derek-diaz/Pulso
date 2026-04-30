<p align="center">
  <img src="docs/pulso-logo.svg" alt="Pulso heart pulse logo" width="128" height="128">
</p>

<h1 align="center">Pulso</h1>

<p align="center">
  Local-first desktop tooling for debugging Allen-Bradley PLC state.
</p>

Pulso is a specialized desktop utility for developers, controls engineers, and robotics teams who need to inspect what an Allen-Bradley PLC knows, what changed, what failed, and what a write actually did.

Pulso is **not** SCADA, an HMI, or an operator dashboard. It is intended for local debugging and commissioning workflows.

## Features

- Connect to Allen-Bradley PLCs over EtherNet/IP through `libplctag`
- Add watched tags manually
- Poll watched tags and isolate read failures per tag
- Highlight recent value changes
- Write values with pre-read, write, and readback verification
- Inspect tag details, last read timing, read errors, and write results
- Use a local event console for connection, polling, read, write, and backend events

## Stack

- Wails v2
- Go backend
- React + Vite + TypeScript frontend
- `github.com/libplctag/goplctag` integration behind the `libplctag` build tag
- `libplctag` native library for real PLC communication

## Development

### Prerequisites

- Go 1.23+
- Node.js and npm
- Wails CLI v2
- Platform WebView dependencies required by Wails

On Ubuntu 24.04, Wails needs the `webkit2_41` tag because the distro provides `libwebkit2gtk-4.1-dev` instead of `libwebkit2gtk-4.0-dev`.

Install frontend dependencies once:

```bash
cd frontend
npm install
```

### Run Without PLC Support

This mode boots the desktop app without requiring native `libplctag`. Connection attempts clearly report that PLC support is not enabled.

```bash
wails dev -tags webkit2_41
```

### Run With Real PLC Support

Real PLC communication uses the official Go wrapper, `github.com/libplctag/goplctag`, which is a cgo wrapper around the native `libplctag` C library.

The PLC helper scripts automatically download, build, and install `libplctag` into `.deps/libplctag-install` the first time they need it:

```bash
./scripts/dev-plc.sh
```

You can also prepare it explicitly:

```bash
./scripts/setup-libplctag.sh
```

The setup script installs the pinned `libplctag` release under the project-local `.deps` directory and expects this file after installation:

```text
.deps/libplctag-install/lib/pkgconfig/libplctag.pc
```

Override the default pinned version when needed:

```bash
LIBPLCTAG_VERSION=2.6.16 ./scripts/setup-libplctag.sh
```

The helper scripts set `PKG_CONFIG_PATH`, `LD_LIBRARY_PATH`, and a project-local Go build cache. Set `PULSO_LIBPLCTAG_AUTO_SETUP=0` to require a pre-existing local libplctag install instead of bootstrapping it.

### Checks

Run frontend checks:

```bash
cd frontend
npm run build
```

Run backend checks without PLC support:

```bash
GOCACHE="$PWD/.deps/go-build" go test . ./backend/...
```

Run backend checks with PLC support:

```bash
source scripts/plc-env.sh
go test -tags libplctag . ./backend/...
```

## Building

Build artifacts are written under `build/bin`.

### Linux

Build without PLC support:

```bash
wails build -tags webkit2_41 -platform linux/amd64
```

Build with PLC support:

```bash
./scripts/build-plc.sh
```

The PLC build embeds an `$ORIGIN/lib` runtime search path and copies `libplctag.so*` into `build/bin/lib`. Distribute both:

```text
build/bin/Pulso
build/bin/lib/
```

Verify the bundled library is being used:

```bash
ldd build/bin/Pulso | grep libplctag
readelf -d build/bin/Pulso | grep RUNPATH
```

Expected result: `libplctag` resolves from `build/bin/lib`, and the binary has `RUNPATH [$ORIGIN/lib]`.

### Windows

Build without PLC support from Windows:

```powershell
wails build -platform windows/amd64
```

Build an NSIS installer:

```powershell
wails build -platform windows/amd64 -nsis
```

For a PLC-enabled Windows build, install or unpack the Windows `libplctag` release, make `pkg-config` able to find `libplctag.pc`, and build with the `libplctag` tag:

```powershell
wails build -platform windows/amd64 -tags libplctag
```

The installed app must include `plctag.dll` next to `Pulso.exe` or in a directory on the process `PATH`. The Windows installer script does not yet automate bundling `plctag.dll`.

### macOS

Build without PLC support from macOS:

```bash
wails build -platform darwin/universal
```

Architecture-specific examples:

```bash
wails build -platform darwin/arm64
wails build -platform darwin/amd64
```

For a PLC-enabled macOS build, build or install `libplctag` for the target architecture, make `pkg-config` able to find `libplctag.pc`, and build with the `libplctag` tag:

```bash
wails build -platform darwin/universal -tags libplctag
```

The `.app` bundle must include the `libplctag` dynamic library and have its library paths adjusted so the executable can load it from inside the app bundle. macOS PLC packaging is not automated yet.

### Cross-Platform Notes

Wails can compile for multiple platforms with `-platform`, but native packaging is most reliable on the target OS because each platform has different WebView, signing, installer, and cgo requirements.

The Linux PLC build is currently the most complete packaged path for `libplctag`: users do not need a system-wide `libplctag` install if `build/bin/lib` is shipped with the app. Windows and macOS still need packaging work to bundle their native `libplctag` libraries automatically.

## Current v0.1 Scope

- Connect/disconnect skeleton and status events
- Manual watched tag add/remove
- Live polling loop with per-tag read error isolation
- Change detection and visible highlights
- Safe write flow with pre-read, write, readback verification, and structured result events
- Event console for connection, polling, read, write, and backend events

Automatic tag discovery, profiles, charts, time-series storage, OPC UA, MQTT, and cloud features are intentionally out of scope for v0.1.
