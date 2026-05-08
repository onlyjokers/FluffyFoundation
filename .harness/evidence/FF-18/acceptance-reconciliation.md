<!--
Purpose: Reconcile FF-18 evidence against the Codex-ready acceptance contract before any FF-19 work starts.
-->

# FF-18 Acceptance Reconciliation

## Result

FF-18 is **blocked for completion** under `docs/harness/ACCEPTANCE.md` and
`.harness/goals/FF-18-review-contract.md`.

Existing FF-18 work provides substantial deterministic source/test proof for the in-memory AI Operator semantic core,
but the evidence repeatedly defers browser/runtime/product proof. The deferral is not currently covered by a dated risk
acceptance with owner, date, missing proof, follow-up item, severity, and expiry/revisit condition.

This reconciliation does not implement FF-18 product/runtime behavior and does not start FF-19.

## Proof Matrix

| Criterion | Required proof type | Deterministic/unit proof | Runtime/browser proof | Evidence path | Status | Deferred risk acceptance | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AI semantic context excludes UI noise and includes required graph/runtime/policy/redaction fields | deterministic | `packages/ai-core/test/semantic-context.test.mjs`; WP1 evidence | `N/A` | `.harness/evidence/FF-18/summary.md` | proven | `N/A` | Evidence records redaction and layout-noise exclusion. |
| AI proposals dry-run semantic operations through shared command bus/API shape | deterministic | WP1, WP2, WP5, WP8 tests and fixture outputs | `N/A` | `.harness/evidence/FF-18/summary.md` | proven | `N/A` | Evidence is command-bus/fixture proof, not live product proof. |
| AI-visible mutations pass through policy, validation, audit, history, rollback, and redaction | deterministic | WP2, WP5, WP6, WP7, WP8 tests and fixture outputs | `N/A` | `.harness/evidence/FF-18/summary.md` | proven | `N/A` | In-memory command bus path is covered. |
| Required FF-18 command surfaces are represented | deterministic | WP5, WP7, WP8 tests and fixture outputs | `N/A` | `.harness/evidence/FF-18/summary.md` | deferred | missing | Runtime override set/clear are explicitly `RUNTIME_OVERRIDE_SURFACE_NOT_IMPLEMENTED`. |
| AI cannot mutate Canvas/Rete/Svelte/UI internals directly | deterministic/static | Recorded `rg` checks in WP2-WP8 evidence | `N/A` | `.harness/evidence/FF-18/summary.md` | proven | `N/A` | No UI mutation path is claimed. |
| GS-12 gyro rotation drives tense flashlight rhythm | deterministic + runtime-browser/product-runtime | `packages/ai-core/test/golden-scenario-contract.test.mjs`; WP4 fixture output | Manager socket and Root Node Graph visible; client e2e page opens but no stable audience client/device/output chain remains registered | `.harness/evidence/FF-18/runtime-browser-investigation.md`; `.harness/evidence/FF-18/root-node-graph-2026-05-08.png` | blocked | missing | Fixture proves command/effect trace only; current browser proof does not prove live gyro/client/flashlight output. |
| GS-13 display visual becomes breathing-like and AI observes output change | deterministic + runtime-browser/product-runtime | `packages/ai-core/test/golden-scenario-contract.test.mjs`; WP4 fixture output | Display registers, but Manager Send Color is rejected by server policy and display remains black | `.harness/evidence/FF-18/runtime-browser-investigation.md`; `.harness/evidence/FF-18/root-node-graph-2026-05-08.png` | blocked | missing | Fixture proves structured observation only; current browser proof shows live display control is blocked, not a visual output change. |
| GS-14 AI repairs param overflow or incompatible graph using structured validation errors | deterministic | `packages/ai-core/test/golden-scenario-contract.test.mjs`; `packages/ai-core/test/observation-repair.test.mjs` | `N/A` | `.harness/evidence/FF-18/summary.md` | proven | `N/A` | Structured validation/repair proof exists. |
| Prompt-injection-like registry/context data is inert and cannot bypass policy | deterministic | `packages/ai-core/test/operator-acceptance.test.mjs`; WP6 evidence | `N/A` | `.harness/evidence/FF-18/summary.md` | proven | `N/A` | Evidence records non-execution and policy denial. |
| Secret-like values and private local paths are redacted before AI-visible context | deterministic | WP1, WP4, WP6 fixture outputs | `N/A` | `.harness/evidence/FF-18/summary.md` | proven | `N/A` | Evidence records redaction counts and examples. |
| Evidence distinguishes deterministic proof from browser/runtime/product proof | documentation | WP1-WP8 verification notes repeatedly say browser/runtime proof is deferred | missing dated acceptance | `.harness/evidence/FF-18/summary.md` | blocked | missing | The distinction exists, but deferred proof is not governed by dated risk acceptance. |

## Stop Conditions Triggered

- Required runtime, browser, or product proof is missing and no valid dated risk acceptance exists.
- Browser/runtime proof would be substituted with deterministic fixtures if FF-18 were marked complete now.
- Completing the missing GS-12/GS-13 proof requires product-chain work beyond the current FF-18 review contract: a stable
  audience client/device/output path for GS-12 and a server/Manager display control fix for GS-13.
- `pnpm harness:verify` currently fails on hotspot ratchets in product/source files outside this reconciliation scope.

## Runtime Browser Investigation Update

Additional real runtime/browser checking on 2026-05-07 confirmed that chrome-devtools MCP is available and Manager is
reachable at `https://localhost:5173/manager/` when certificate validation is bypassed, but the Server runtime did not
listen on `https://localhost:3001` in that run.

Single-server startup fails during Nest application initialization:

```text
Nest can't resolve dependencies of the ClientControlTransferService (?, Object). Please make sure that the argument
Object at index [0] is available in the EventsModule context.
```

See `.harness/evidence/FF-18/runtime-browser-investigation.md`.

An earlier 2026-05-08 follow-up check improved the runtime picture but did not resolve FF-18 acceptance:

```text
curl -k -I https://localhost:3001/health
PASS: HTTP/1.1 200 OK

curl -k -I https://localhost:5173/manager/
PASS: HTTP/2 200

browser-use + chrome-devtools
PASS: Manager login reaches the connect panel as user Eureka.

chrome-devtools click Connect
FAIL: page shows "Failed to connect. Please check the server URL."

chrome-devtools network
FAIL: Socket.IO polling to https://localhost:3001/socket.io/?role=manager... fails with NET::ERR_CERT_AUTHORITY_INVALID.
```

That earlier check kept the then-current blocker active rather than resolving it: obtaining required
browser/runtime/product proof appeared to require a bounded dev-certificate, manager connection, or server runtime
change outside the current FF-18 review contract implementation scope.

2026-05-08 clean recheck supersedes the Manager socket certificate blocker:

```text
browser-use browser_navigate https://localhost:3001/health
PASS: health JSON rendered in the browser.

browser-use browser_navigate https://localhost:5173/manager/
PASS: reached the Manager connect screen while logged in as Eureka.

browser-use browser_click Connect
PASS: reached the main Manager UI with Published Group Controls, Clients (0), Display, Performance Mode, and Server
State panels.

chrome-devtools list_console_messages includePreservedMessages=false
PASS: no certificate or SDK connection errors after navigation; only Svelte unknown-prop warnings.

chrome-devtools list_network_requests includePreservedRequests=false
PASS: Socket.IO polling requests to https://localhost:3001/socket.io returned HTTP 200.

chrome-devtools navigate to https://localhost:5173/manager/root + Connect + click Node Graph
PASS: Root Node Graph rendered Start, minimap controls, and Minimap canvas.

chrome-devtools take_screenshot
PASS: saved .harness/evidence/FF-18/root-node-graph-2026-05-08.png.
```

This improves runtime evidence but does not complete FF-18: GS-12 and GS-13 still lack product scenario proof, and
runtime override set/clear remains explicitly deferred.

2026-05-08 Manager role and product-chain recheck:

```text
SHUGU_ALLOW_INSECURE_MANAGER=1 corepack pnpm@8.15.9 dev:server
PASS: local server starts and grants requested=manager as granted=manager.

curl -k -s https://localhost:3001/clients
PASS: managers array is non-empty and display client is registered with group=display.

browser-use Manager -> Display -> Send Color
FAIL: display remains black.

server log
FAIL: control message rejected with code=server.policy.scope_mismatch, path=target.groupId,
message="target group must match scopeGroupId".

browser-use client e2e page
BLOCKED: a normal client can open, but no stable audience client/device/output chain remains registered for GS-12.
```

This resolves the earlier Manager role downgrade as a runtime configuration issue, but it strengthens the FF-18 stop
condition: the live product chain itself blocks GS-12/GS-13 proof. Fixing the rejected display control or stable client
runtime path would require changes in forbidden product/runtime paths under the active FF-18 review contract.

## Validation Snapshot

Recent validation run during FF-18 hotspot/runtime reconciliation:

```text
pnpm harness:validate
PASS

git diff --check
PASS

corepack pnpm@8.15.9 --filter @shugu/ai-core run build
PASS

corepack pnpm@8.15.9 --filter @shugu/node-core run build
PASS

corepack pnpm@8.15.9 --filter @shugu/ai-core run lint
PASS

corepack pnpm@8.15.9 --filter @shugu/node-core run lint
PASS

node --test packages/ai-core/test/*.test.mjs packages/node-core/test/semantic-command-bus.test.mjs packages/node-core/test/group-ownership-policy.test.mjs
PASS: 38 tests, 0 failures

corepack pnpm@8.15.9 validate:node-specs
PASS: 49 files, 26 warnings, 0 errors

git diff --check
PASS

corepack pnpm@8.15.9 verify
FAIL: harness:hotspots fails on apps/server/src/assets/assets.service.ts
```

The remaining hotspot failure is:

```text
apps/server/src/assets/assets.service.ts: 498 lines exceeds ratchet max 492
```

That file is outside `.harness/goals/FF-18-review-contract.md` allowed implementation paths. The FF-18 refactor split
the prior AI/node-core hotspot files so the new helper files stay below the 250-line warning threshold.

Fresh validation after the 2026-05-08 product-chain stop evidence update:

```text
corepack pnpm@8.15.9 harness:validate
PASS

python3 .harness/scripts/validate_acceptance_contracts.py
PASS

git diff --check
PASS

corepack pnpm@8.15.9 verify
FAIL: harness:hotspots fails on apps/server/src/assets/assets.service.ts
```

The fresh `verify` run still reached and passed dependency guards, lint, build, node-core tests, FF-08 tests, FF-09
tests, node spec validation, offline node-executor e2e, and FF-08 Manager boundary guard before failing at
`harness:hotspots` with the same out-of-scope hotspot:

```text
apps/server/src/assets/assets.service.ts: 498 lines exceeds ratchet max 492
```

## Next Required Decision

Do not start FF-19 yet.

The next valid path is one of:

- approve a dated risk acceptance for the missing FF-18 runtime/browser/product proof, with owner, date, follow-up item,
  severity, and revisit condition; or
- approve a bounded FF-18 runtime/browser/product proof task that starts with failing tests or executable scenario proof
  and revises the contract before touching `apps/server/**`, Manager product controls, client runtime, or display
  runtime; or
- revise the FF-18 contract if the missing proof is intentionally deferred to a later FF item.
