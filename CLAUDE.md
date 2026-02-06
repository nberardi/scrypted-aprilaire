# CLAUDE.md - AI Assistant Guide for scrypted-aprilaire

## Project Overview

This is a **Scrypted plugin** that integrates Aprilaire home automation thermostats (8800 and 6000 series) into the Scrypted smart home platform. It communicates with thermostats over TCP using Aprilaire's proprietary binary protocol and exposes them as Scrypted devices (thermostats, humidifiers, dehumidifiers, outdoor sensors).

- **Repository**: https://github.com/nberardi/scrypted-aprilaire
- **License**: MIT
- **Runtime dependency**: `@scrypted/sdk` (Scrypted plugin framework)

## Build & Development Commands

```bash
# Install dependencies
npm install

# Build the plugin (webpack bundle via Scrypted toolchain)
npm run build

# Production build (used before npm publish)
NODE_ENV=production npm run prepublishOnly

# Deploy and debug in Scrypted (VS Code)
npm run scrypted-vscode-launch

# Deploy to Scrypted instance
npm run scrypted-deploy
```

There is **no test suite** in this project. Testing is done through Scrypted runtime debugging with real Aprilaire hardware.

There are **no linting or formatting tools** configured.

## Project Structure

```
src/
├── main.ts                          # Entry point - exports AprilairePlugin
├── AprilairePlugin.ts               # Plugin class (DeviceProvider, DeviceCreator, Settings)
├── AprilaireClient.ts               # TCP client, binary protocol, CRC, enums
├── AprilaireThermostatBase.ts       # Base device class (Online, Refresh)
├── AprilaireThermostat.ts           # Thermostat device (temp, fan, humidity, filter)
├── AprilaireHumidifier.ts           # Humidifier device
├── AprilaireDehumidifier.ts         # Dehumidifier device
├── AprilaireOutdoorThermometer.ts   # Outdoor temperature sensor device
├── BasePayloadRequest.ts            # Base class for protocol requests
├── BasePayloadResponse.ts           # Base class for protocol responses
├── FunctionalDomainControl.ts       # Setpoints, modes, IAQ availability
├── FunctionalDomainSensors.ts       # Indoor/outdoor sensor data
├── FunctionalDomainStatus.ts        # COS, sync, thermostat status, errors
├── FunctionalDomainScheduling.ts    # Holds, heat blast, away/vacation
├── FunctionalDomainIdentification.ts # MAC, model, firmware, name
├── FunctionalDomainAlerts.ts        # Service reminders, alerts
├── FunctionalDomainSetup.ts         # Installer settings, temp scale
├── FunctionalDomainDisplay.ts       # Display settings (stub)
├── FunctionalDomainLockout.ts       # Lockout config (stub)
└── FunctionalDomainMessaging.ts     # Messaging (stub)

tools/aprilaire-proxy/               # Standalone TCP proxy for thermostat debugging
.github/workflows/npm-publish.yml    # CI: build verification + npm publish on release
```

## Architecture

### Layer Overview

1. **Plugin layer** (`AprilairePlugin`): Manages device discovery, multi-thermostat coordination (outdoor sensor sync, hold sync), and plugin-level settings.
2. **Device layer** (`AprilaireThermostat`, `AprilaireHumidifier`, etc.): Implements Scrypted interfaces (Thermometer, TemperatureSetting, Fan, HumiditySetting, etc.) and translates Scrypted commands into protocol requests.
3. **Client layer** (`AprilaireClient`): EventEmitter-based TCP client that sends/receives binary frames. Emits `"ready"` when device identification completes, and `"response"` for all parsed responses.
4. **Protocol layer** (`FunctionalDomain*.ts`, `BasePayload*.ts`): Request/response classes for each protocol functional domain. Each class serializes to/from `Buffer`.

### Binary Protocol

- **Transport**: TCP (port 8000 for 8800 series, port 7000 for 6000 series)
- **Frame format**: 7-byte header + variable payload + 1-byte CRC
  - Header: revision (1B), sequence (1B), payload length (2B big-endian), action (1B), functional domain (1B), attribute (1B)
- **Actions**: Write (1), ReadRequest (2), ReadResponse (3), COS (5), NAck (6)
- **11 Functional Domains**: Setup, Control, Scheduling, Alerts, Sensors, Lockout, Status, Identification, Messaging, Display, Weather
- **CRC**: Lookup-table-based CRC validation (256-entry table in `AprilaireClient.ts`)

### Temperature Encoding

Custom byte encoding with half-degree precision:
- Bit 7: negative sign
- Bit 6: half-degree fraction (0.5)
- Bits 0-5: integer value

Utility functions: `convertTemperatureToByte()` and `convertByteToTemperature()` in `AprilaireClient.ts`.

### Multi-Thermostat Features

- **Outdoor sensor sync**: Propagates outdoor temp from thermostats with sensors to those without (configurable interval, default 1 min)
- **Hold sync**: Broadcasts away/vacation holds across all managed thermostats

## Key Conventions

### TypeScript & Module System

- **Target**: ESNext with NodeNext module resolution
- **Imports**: Use `node:` prefix for Node.js built-ins (e.g., `import net from 'node:net'`)
- **Build**: Scrypted's webpack toolchain bundles everything; no separate TypeScript compilation step

### Scrypted Patterns

- Plugin entry point must export a class from `src/main.ts`
- Device classes extend `ScryptedDeviceBase` and implement Scrypted interfaces
- Device settings use `StorageSettings` from `@scrypted/sdk/storage-settings`
- Device discovery uses `deviceManager.onDeviceDiscovered()`
- Refresh is implemented via the `Refresh` interface with a 5-minute interval (`getRefreshFrequency` returns 300 seconds)

### Code Style

- No explicit formatting/linting configuration; follow existing style
- Classes use PascalCase, methods use camelCase
- Protocol response classes follow the naming pattern `{DomainName}Response` (e.g., `ThermostatSetpointAndModeSettingsResponse`)
- Protocol request classes follow `{DomainName}Request`
- Each functional domain has its own file: `FunctionalDomain{Name}.ts`
- `var` is used in some places (existing code pattern); prefer `let`/`const` for new code

### Event-Driven Communication

- `AprilaireClient` extends `EventEmitter`
- Key events: `"connected"`, `"ready"`, `"disconnected"`, `"response"`
- Device classes bind to `client.on("response", ...)` to process incoming data
- Response routing: `AprilaireClient.clientResponse()` handles identification responses; all responses are forwarded via the `"response"` event to both plugin-level and device-level handlers

## CI/CD

- **Trigger**: GitHub release creation
- **Pipeline**: `npm ci` build verification, then `npm publish --access=public` to npm
- **Node version**: 20

## Important Notes for AI Assistants

- This plugin communicates with **real hardware** over TCP. Changes to the protocol layer (`AprilaireClient.ts`, `FunctionalDomain*.ts`) must preserve exact byte-level compatibility.
- The CRC lookup table in `AprilaireClient.ts` must not be modified.
- Temperature values in the protocol are always in Celsius. Conversion to/from display units happens at the Scrypted interface boundary.
- Several `FunctionalDomain` files (`Display`, `Lockout`, `Messaging`) are stubs with minimal implementation.
- The `tools/aprilaire-proxy/` directory is a standalone project with its own `package.json` and `tsconfig.json`.
- The foundational protocol work is credited to https://github.com/chamberlain2007/aprilaire-ha.
