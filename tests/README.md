# Protocol unit tests

These tests are the oracle for protocol correctness. They assert documented wire behavior, not the current implementation’s quirks.

```bash
npm test # single run
npm run test:watch
```

## Layout

| File | Coverage |
|------|----------|
| `helpers/guide-reference.ts` | Shared constants & correct encode/decode |
| `attribute-table.test.ts` | Domain, attribute, action, NACK numbers |
| `temperature.test.ts` | Temperature bit layout + examples |
| `frame-and-response-factory.test.ts` | Frame routing + NACK policy |
| `functional-domain-control.test.ts` | Control domain |
| `functional-domain-status.test.ts` | Status domain |
| `functional-domain-sensors.test.ts` | Sensors domain |
| `functional-domain-scheduling.test.ts` | Scheduling domain |
| `functional-domain-identification.test.ts` | Identification domain |
| `functional-domain-alerts.test.ts` | Alerts domain |
| `functional-domain-setup.test.ts` | Setup domain |
| `best-practices-bootstrap.test.ts` | Connect checklist |

## Interpreting failures

Failing tests mean production code does **not** match the protocol. That is intentional until the corresponding fix lands.
