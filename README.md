# scrypted-aprilaire

Scrypted plugin for Aprilaire / AprilAire Wi‑Fi and home-automation thermostats (8800 and 6000 series class devices).

## Protocol documentation

Binary TCP protocol reference for integrators:

| Resource | Location |
|----------|----------|
| Protocol docs | [Wiki](https://github.com/nberardi/scrypted-aprilaire/wiki) |
| Protocol unit tests | `npm test` |
| Implementation backlog | [Issue #37](https://github.com/nberardi/scrypted-aprilaire/issues/37) |

## Development

```bash
npm install
npm test          # protocol unit tests
npm run build     # scrypted-webpack
```

See [CLAUDE.md](CLAUDE.md) for architecture and conventions.
