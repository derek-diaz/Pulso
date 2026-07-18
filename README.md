<p align="center">
  <img src="assets/web/icon-512.png" alt="Pulso logo" width="128" height="128">
</p>

<h1 align="center">Pulso</h1>

<p align="center">
  A local-first PLC state debugger for Allen-Bradley telemetry investigation.
</p>

<p align="center">
  <strong>Debug tags. Inspect changes. Verify writes. Stay close to the controller.</strong>
</p>

<p align="center">
  <img src="assets/pulso.gif" alt="Pulso being used to inspect PLC telemetry" width="900">
</p>

Pulso is a desktop tool for developers, controls engineers, robotics teams, and commissioning workflows where you need to understand what an Allen-Bradley PLC is doing right now.

It is built for local debugging: watch tags, isolate read failures, inspect recent samples, discover controller tags, and write values with readback verification. It is not a SCADA system, HMI, cloud dashboard, or operator runtime.

## Download Pulso

If you just want to use Pulso, download the latest installer from the [GitHub Releases page](https://github.com/derek-diaz/Pulso/releases).

Development setup is only needed if you want to build Pulso from source, modify the app, or work on the PLC emulator.

## ⚠️ Read Before Connecting to a PLC

> [!WARNING]
> ⚠️ Pulso can write values to a real PLC. Exercise extreme caution when connecting to production equipment or any controller attached to physical machinery.
>
> 🛑 Before writing values, verify the controller address, tag name, data type, current machine state, and expected effect of the write. Pulso is a debugging and integration tool, not a safety system or operator interface.

## Why Pulso Exists

Pulso started from a practical frustration: Allen-Bradley integration work is still heavily tied to Windows tooling. If you are developing on Linux, even basic PLC state inspection can push you into a Windows VM just to run Studio 5000 and see what the controller is doing.

Pulso is the tool I wanted for that workflow. It gives Linux-first and cross-platform engineering teams a focused way to inspect Allen-Bradley PLC data during integration without opening Studio 5000 for every tag check.

Industrial debugging often happens in the gap between source code, controller state, and the real machine. Pulso gives that work a local desktop surface:

- Watch live PLC tags over EtherNet/IP
- See current and previous values, deltas, activity, stale reads, and errors
- Inspect individual tags with recent samples and write history
- Write values with pre-read, write, and readback verification
- Discover readable controller tags and UDT members
- Import and export watch lists as JSON or CSV

## Local Development

Clone the repo, run the setup script for your OS, then start the PLC-enabled dev app.

Windows:

```powershell
.\scripts\setup-dev-windows.ps1
.\scripts\dev-plc.ps1
```

Linux:

```bash
bash scripts/setup-dev-linux.sh
bash scripts/dev-plc.sh
```

macOS:

```bash
bash scripts/setup-dev-macos.sh
bash scripts/dev-plc.sh
```

The setup scripts install or verify the local development toolchain, install frontend dependencies, install the Wails CLI, and stage `libplctag` under `.deps` when needed.

## Offline PLC Emulator

Pulso includes an external ControlLogix-style emulator so you can develop and test without real PLC hardware. It runs as a TCP service, and Pulso connects through the same `libplctag` path used for real controllers.

Start the sample emulator:

```powershell
.\scripts\run-plc-emulator.ps1
```

```bash
bash scripts/run-plc-emulator.sh
```

Then connect Pulso with:

```text
Address: 127.0.0.1
Path:    1,0
```

The default profile is `emulator/profiles/sample-logix.json`. You can create another JSON profile with `tags` and `udts`, then pass it to the runner:

```powershell
.\scripts\run-plc-emulator.ps1 -Profile .\emulator\profiles\my-line.json
```

```bash
bash scripts/run-plc-emulator.sh 127.0.0.1:44818 emulator/profiles/my-line.json
```

## Build From Source

Build artifacts are written under `build/bin`.

Containerized PLC builds:

```bash
./scripts/docker-build-plc.sh linux-deb
./scripts/docker-build-plc.sh windows-amd64
./scripts/docker-build-plc.sh all
```

Linux PLC executable:

```bash
./scripts/build-plc.sh
```

Linux Debian package:

```bash
./scripts/package-linux-plc-deb.sh
```

Windows PLC installer from Windows:

```powershell
.\scripts\build-windows-plc.ps1 -Arch amd64 -LibPlcTagRoot C:\path\to\libplctag
```

macOS app bundle:

```bash
wails build -platform darwin/universal
```

For a PLC-enabled macOS build, provide a target-architecture `libplctag` install, make `pkg-config` able to find `libplctag.pc`, and build with:

```bash
wails build -platform darwin/universal -tags libplctag
```

## Contributing

Pulso is early-stage but intended to be useful in real engineering workflows. Good contributions are usually small and practical:

- PLC read/write correctness
- Emulator fidelity
- Watch-list import/export behavior
- Tag discovery and UDT handling
- UI clarity for debugging dense telemetry
- Packaging and installer reliability
- Documentation that helps another engineer reproduce a workflow

Before opening a larger change, start with an issue or discussion so the scope stays aligned with the project.

## Safety Checklist

Pulso can write values to a PLC when PLC support is enabled. Treat every write as an intentional control action:

- Do not use it as an operator interface
- Do not use it as a safety system
- Do not write to production equipment unless you understand the consequence
- Verify the target controller, tag name, data type, and intended value before writing
- Confirm the machine or process is in a safe state before writing
- Prefer the emulator or a test controller for development

## License

Pulso is released under the Apache License 2.0. See [LICENSE](LICENSE).

Made in Puerto Rico. 🇵🇷
