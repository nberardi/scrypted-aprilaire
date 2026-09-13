# Agent instructions (scrypted-aprilaire)

Read this file before changing protocol, transport, or thermostat mapping code.

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

## Tests

```bash
npm test
```

Protocol unit tests in `tests/` compare production code to documented wire behavior. A failing test means the implementation does not match the spec.

Project layout, build commands, and Scrypted conventions: [CLAUDE.md](CLAUDE.md).
