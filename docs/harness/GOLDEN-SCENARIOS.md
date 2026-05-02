<!--
Purpose: Define executable end-to-end scenarios that prove FluffyFoundation is ready for real performance use.
-->

# Golden Scenarios

Each scenario starts as a spec and must become an executable harness before its owning PLAN item exits.

| ID | Scenario | Owning Item | Required Proof |
| --- | --- | --- | --- |
| GS-01 | Manager controls 10 clients with screen color, flashlight fallback, vibration, and stop-all | FF-01, FF-22 | Playwright or socket fixture + logs |
| GS-02 | Root publishes a Group; Manager performs only the published surface | FF-08, FF-12 | Browser evidence + command trace |
| GS-03 | Bad manager auth is rejected by default | FF-04 | Server test + CI log |
| GS-04 | Command scope survives SDK batching and server routing | FF-05 | Unit + integration fixture |
| GS-05 | Malformed protocol payload is rejected with structured error | FF-03 | Contract test |
| GS-06 | Client local NodeExecutor loop deploys, runs, stops, removes, and reports status | FF-14 | Existing e2e extended |
| GS-07 | Display local bridge succeeds, then forced failure falls back to server | FF-15 | Browser/transport trace |
| GS-08 | Asset upload/preload/play works for image, video, and audio | FF-16 | E2E + readiness log |
| GS-09 | ControlPlane transfer to client requires accept and expires on timeout | FF-13 | Server/client fixture |
| GS-10 | Client controller disconnect returns ownership to previous operator | FF-13 | Reconnect fixture |
| GS-11 | Multi-display routing sends different outputs to two displays | FF-15 | E2E trace |
| GS-12 | AI turns gyro rotation into tense flashlight rhythm through graph commands | FF-18 | AI proposal/execution trace |
| GS-13 | AI turns display visual into breathing-like output and observes change | FF-18 | AI command trace + visual assertion |
| GS-14 | AI receives validation error and repairs incompatible graph | FF-18, FF-19 | Structured error + repair trace |
| GS-15 | Redaction prevents secrets/private paths in AI context | FF-19 | Redaction fixture |
| GS-16 | Rollback restores previous semantic revision and output behavior | FF-11 | Contract + runtime fixture |
| GS-17 | Load test meets show-mode latency/drop/FPS budgets | FF-22 | Load report artifact |
| GS-18 | Root stop-all clears clients, displays, media, sound, visuals, and partitions | FF-16, FF-22 | Drill evidence |

## Evidence Rules

- Every scenario stores command logs, trace/screenshot where applicable, and structured status reports under `.harness/evidence/` or CI artifacts.
- A manual scenario may unblock early development only with explicit risk acceptance; it must become executable before release readiness.
- Scenario failures must produce actionable structured errors, not only screenshots.
