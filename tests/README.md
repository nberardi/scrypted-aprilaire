# Protocol unit tests

These tests are the oracle for protocol correctness. They assert **wiki** wire behavior, not the current implementation’s quirks. The wiki is the spec; `helpers/guide-reference.ts` is derived from it. See [AGENTS.md](../AGENTS.md).

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
| `tcp-frame-reassembly.test.ts` | Stream framing, partial/batched frames, per-pass cap |
| `nack-retry-queue.test.ts` | Sequence allocation, NACK retry policy, transport gating, reconnect requeue |
| `connection-supervisor.test.ts` | Reconnect backoff, connect timeout, liveness probe |
| `native-ids.test.ts` | Child nativeId suffixes and MAC recovery |
| `hold-sync-echo-guard.test.ts` | Away/Vacation hold-sync echo suppression |

## Interpreting failures

Failing tests mean production code does **not** match the protocol. That is intentional until the corresponding fix lands.
