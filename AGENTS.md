# Agent instructions (scrypted-aprilaire)

Read this file before changing protocol, transport, or thermostat mapping code.

This is a **Scrypted plugin** that integrates Aprilaire home automation thermostats (8800 and 6000 series) into the Scrypted smart home platform. It communicates with thermostats over TCP using Aprilaire's proprietary binary protocol and exposes them as Scrypted devices (thermostats, humidifiers, dehumidifiers, outdoor sensors).

- **Repository**: https://github.com/nberardi/scrypted-aprilaire
- **License**: MIT
- **Runtime dependency**: `@scrypted/sdk` (Scrypted plugin framework)

## The wiki is the protocol spec

Authoritative documentation is the **GitHub Wiki**, not this git tree.

- Browse: https://github.com/nberardi/scrypted-aprilaire/wiki
- Clone (GitHub’s HTML wiki can 403; the wiki repo is the reliable copy):

```bash
git clone https://github.com/nberardi/scrypted-aprilaire.wiki.git
```

Do **not** commit manufacturer manuals (`.docx` / `.pdf`). They are gitignored. Do **not** reverse the spec from `src/` comments, Home Assistant, or aprilaire-ha.

### Read the wiki before you edit wire behavior

Before changing `src/FunctionalDomain*.ts`, `src/AprilaireClient.ts`, CRC/frame/NACK/queue code, temperature encoding, or Scrypted command → wire mapping, **read the relevant wiki pages in full**. Do not skim a single table.

| Kind of change | Wiki pages to read completely |
|----------------|-------------------------------|
| Any protocol / transport work | [Packet Frame](https://github.com/nberardi/scrypted-aprilaire/wiki/Packet-Frame), [Actions and Transactions](https://github.com/nberardi/scrypted-aprilaire/wiki/Actions-and-Transactions), [NACK Codes](https://github.com/nberardi/scrypted-aprilaire/wiki/NACK-Codes) |
| Temperatures or setpoints | [Temperature Encoding](https://github.com/nberardi/scrypted-aprilaire/wiki/Temperature-Encoding) (plus [Conversion Table](https://github.com/nberardi/scrypted-aprilaire/wiki/Temperature-Conversion-Table) if touching °F display) |
| A `FunctionalDomain*.ts` file | The matching **Domain-*** page |
| Connect, COS subscribe, bootstrap | [Best Practices](https://github.com/nberardi/scrypted-aprilaire/wiki/Best-Practices), [Domain Status](https://github.com/nberardi/scrypted-aprilaire/wiki/Domain-Status) |
| Attribute numbers | [Attribute Table](https://github.com/nberardi/scrypted-aprilaire/wiki/Attribute-Table) **and** the domain page |
| “The guide says X but the code says Y” | [Guide Errata](https://github.com/nberardi/scrypted-aprilaire/wiki/Guide-Errata) |

If the task is a spec review or a protocol bug hunt, read **every** page listed on [Home](https://github.com/nberardi/scrypted-aprilaire/wiki) / `_Sidebar.md`. Skipping pages is how Auto humidification **1–7 vs %RH** and Written ODT’s **&lt; 10 minute** refresh rule were missed.

Full sidebar:

- Fundamentals: Home, Protocol Overview, Packet Frame, Actions and Transactions, Temperature Encoding, Temperature Conversion Table, NACK Codes, Best Practices, Attribute Table, Guide Errata
- Domains: Setup, Control, Scheduling, Alerts, Sensors, Lockout, Status, Identification, Messaging & Display
- Project (not spec): Codebase Mapping, Implementation Backlog

### What is not the spec (do not “fix” the wiki to match code)

When these disagree with the wiki, **change production code and tests** to match the wiki.

- `tests/helpers/guide-reference.ts` — test oracle **derived from** the wiki. Update it when the wiki is right and the helper is stale.
- Wiki **Codebase Mapping** and **Implementation Backlog** — implementation status. They lag. Do not treat “not implemented” there as permission to skip a domain page.
- The attribute tables in `src/FunctionalDomain*.ts` file headers
- Observed Home Assistant / aprilaire-ha behavior

After you change wire behavior or coverage, update Codebase Mapping / Implementation Backlog **on the wiki** (separate git repo). Do not invent attributes or value windows from comments.

### Wire rules that have already caused production bugs

- Protocol temperatures are always Celsius. Convert at the Scrypted boundary only.
- Never modify the CRC lookup table in `AprilaireClient.ts`.
- Humidification Auto setpoints are indices **1–7**, not %RH. Manual is **10–50** %RH ([Domain Control](https://github.com/nberardi/scrypted-aprilaire/wiki/Domain-Control) §2.4). Installer default humidifier mode is often Automatic.
- Written Outdoor Temperature (Automation mode) must be refreshed **more often than every 10 minutes** ([Domain Sensors](https://github.com/nberardi/scrypted-aprilaire/wiki/Domain-Sensors) §5.4).
- Heat Blast COS is `0` Off / `1` On; later COS (auto-cancel) must replace local UI state ([Domain Scheduling](https://github.com/nberardi/scrypted-aprilaire/wiki/Domain-Scheduling) §3.5).
- §2.7 capabilities **3** and **4** do not include Auto. Scrypted HeatCool and Auto both write protocol mode **5** — only offer them when Auto changeover is listed. Emergency Heat is protocol mode **4**; Scrypted has no `ThermostatMode.EmergencyHeat`.

This plugin talks to **real hardware** over TCP. Protocol-layer changes must preserve exact byte-level compatibility.

## Build & development commands

```bash
# Install dependencies
npm install

# Protocol unit tests (once / watch)
npm test
npm run test:watch

# Build the plugin (webpack bundle via Scrypted toolchain)
npm run build

# Production build (used before npm publish)
NODE_ENV=production npm run prepublishOnly

# Deploy and debug in Scrypted (VS Code)
npm run scrypted-vscode-launch

# Deploy to Scrypted instance
npm run scrypted-deploy
```

Protocol unit tests live in `tests/`. They assert wire-level protocol behavior (attribute numbers, temperature encoding, hold layout, NACK policy, etc.) so protocol fixes can be validated without hardware.

A failing test means the implementation does not match the spec.

Hardware integration is still validated via Scrypted runtime debugging with real Aprilaire thermostats.

There are **no linting or formatting tools** configured.

## Project structure

```
src/
├── main.ts                           # Entry point - exports AprilairePlugin
├── AprilairePlugin.ts                # Plugin class (DeviceProvider, DeviceCreator, Settings)
├── AprilaireClient.ts                # TCP client, binary protocol, CRC, enums
├── AprilaireThermostatBase.ts        # Base device class (Online, Refresh)
├── AprilaireThermostat.ts            # Thermostat device (temp, fan, humidity, filter)
├── AprilaireHumidifier.ts            # Humidifier device
├── AprilaireDehumidifier.ts          # Dehumidifier device
├── AprilaireOutdoorThermometer.ts    # Outdoor temperature sensor device
├── BasePayloadRequest.ts             # Base class for protocol requests
├── BasePayloadResponse.ts            # Base class for protocol responses
├── FunctionalDomainControl.ts        # Setpoints, modes, IAQ availability
├── FunctionalDomainSensors.ts        # Indoor/outdoor sensor data
├── FunctionalDomainStatus.ts         # COS, sync, thermostat status, errors
├── FunctionalDomainScheduling.ts     # Holds, heat blast, away/vacation
├── FunctionalDomainIdentification.ts # MAC, model, firmware, name
├── FunctionalDomainAlerts.ts         # Service reminders, alerts
├── FunctionalDomainSetup.ts          # Installer settings, temp scale
├── FunctionalDomainDisplay.ts        # Display settings (implementation map)
├── FunctionalDomainLockout.ts        # Lockout config (implementation map)
└── FunctionalDomainMessaging.ts      # Messaging (implementation map)

tests/                                # Protocol unit tests
tools/aprilaire-proxy/                # Standalone TCP proxy for thermostat debugging
.github/workflows/ci.yml              # CI: tests + production build on every PR / push to main
.github/workflows/npm-publish.yml     # Release: build, test, publish to GitHub Packages
```

Each `FunctionalDomain*.ts` file header lists that domain’s attributes and which ones are implemented. Keep those tables even for unimplemented domains (Lockout, Messaging, Display).

The `tools/aprilaire-proxy/` directory is a standalone project with its own `package.json` and `tsconfig.json`.

## Architecture

### Layer overview

1. **Plugin layer** (`AprilairePlugin`): Manages device discovery, multi-thermostat coordination (outdoor sensor sync, hold sync), and plugin-level settings.
2. **Device layer** (`AprilaireThermostat`, `AprilaireHumidifier`, etc.): Implements Scrypted interfaces (Thermometer, TemperatureSetting, Fan, HumiditySetting, etc.) and translates Scrypted commands into protocol requests.
3. **Client layer** (`AprilaireClient`): EventEmitter-based TCP client that sends/receives binary frames. Emits `"ready"` when device identification completes, and `"response"` for all parsed responses.
4. **Protocol layer** (`FunctionalDomain*.ts`, `BasePayload*.ts`): Request/response classes for each protocol functional domain. Each class serializes to/from `Buffer`.

### Binary protocol

- **Transport**: TCP (port 8000 for 8800 series, port 7000 for 6000 series)
- **Frame format**: 7-byte header + variable payload + 1-byte CRC
  - Header: revision (1B), sequence (1B), payload length (2B big-endian), action (1B), functional domain (1B), attribute (1B)
- **Actions**: Write (1), ReadRequest (2), ReadResponse (3), COS (5), NAck (6)
- **10 Functional Domains**: Setup, Control, Scheduling, Alerts, Sensors, Lockout, Status, Identification, Messaging, Display
- **CRC**: Lookup-table-based CRC validation (256-entry table in `AprilaireClient.ts`)

### Temperature encoding

Custom byte encoding with half-degree precision:

- Bit 7: negative sign
- Bit 6: half-degree fraction (0.5)
- Bits 0–5: integer value

Utility functions: `convertTemperatureToByte()` and `convertByteToTemperature()` in `AprilaireClient.ts`.

### Multi-thermostat features

- **Outdoor sensor sync**: Propagates outdoor temp from thermostats with sensors to those without (configurable interval, default 1 min; must stay under 10 min)
- **Hold sync**: Broadcasts away/vacation holds across all managed thermostats

## Conventions

### TypeScript & module system

- **Target**: ESNext with NodeNext module resolution
- **Imports**: Use `node:` prefix for Node.js built-ins (e.g., `import net from 'node:net'`)
- **Build**: Scrypted's webpack toolchain bundles everything; no separate TypeScript compilation step

### Scrypted patterns

- Plugin entry point must export a class from `src/main.ts`
- Device classes extend `ScryptedDeviceBase` and implement Scrypted interfaces
- Device settings use `StorageSettings` from `@scrypted/sdk/storage-settings`
- Device discovery uses `deviceManager.onDeviceDiscovered()`
- Refresh is implemented via the `Refresh` interface with a 5-minute interval (`getRefreshFrequency` returns 300 seconds)

### Code style

- No explicit formatting/linting configuration; follow existing style
- Classes use PascalCase, methods use camelCase
- Protocol response classes follow the naming pattern `{DomainName}Response` (e.g., `ThermostatSetpointAndModeSettingsResponse`)
- Protocol request classes follow `{DomainName}Request`
- Each functional domain has its own file: `FunctionalDomain{Name}.ts`
- `var` is used in some places (existing code pattern); prefer `let`/`const` for new code

### Event-driven communication

- `AprilaireClient` extends `EventEmitter`
- Key events: `"connected"`, `"ready"`, `"disconnected"`, `"response"`
- Device classes bind to `client.on("response", ...)` to process incoming data
- Response routing: `AprilaireClient.clientResponse()` handles identification responses; all responses are forwarded via the `"response"` event to both plugin-level and device-level handlers

## CI/CD

Two workflows in `.github/workflows/`, both on Node 22:

- **`ci.yml`** — every pull request and push to `main`: `npm ci`, unit tests, production webpack bundle, and `dist/plugin.zip` artifact verification.
- **`npm-publish.yml`** — GitHub release (or manual dispatch): same build + tests, then publishes to **GitHub Packages** as `@nberardi/scrypted-aprilaire` using `GITHUB_TOKEN`. It does **not** publish to npmjs.org.
- **npmjs.org** (`scrypted-aprilaire`) is published locally when needed: `npm run publish:npmjs` (requires OTP).

The foundational protocol work is credited to https://github.com/chamberlain2007/aprilaire-ha.
