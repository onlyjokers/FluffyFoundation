<!--
Purpose: Handoff the FF-18 product-chain stop condition found during real browser/runtime checking.
-->

# FF-18 Product Chain Stop Handoff

Date: 2026-05-08

## Summary

FF-18 remains incomplete. Do not start FF-19.

The earlier Manager role downgrade was caused by local runtime configuration. Restarting the server with
`SHUGU_ALLOW_INSECURE_MANAGER=1` lets Manager connections be granted as managers. Browser-use and server logs then show
the remaining blockers are product-chain blockers, not browser-tool availability issues.

## Evidence

- `.harness/evidence/FF-18/runtime-browser-investigation.md`
- `.harness/evidence/FF-18/acceptance-reconciliation.md`
- `.harness/evidence/FF-18/summary.md`
- `.harness/status/current-task.md`

## Runtime Result

```text
SHUGU_ALLOW_INSECURE_MANAGER=1 corepack pnpm@8.15.9 dev:server
PASS: server starts on https://localhost:3001

server log
PASS: requested=manager granted=manager

curl -k -s https://localhost:3001/clients
PASS: managers array is non-empty
PASS: display client is registered with group=display
```

## Browser Product Result

```text
browser-use browser_navigate https://localhost:5173/manager/
PASS: Manager connect screen appears while logged in as Eureka.

browser-use browser_click Connect
PASS: Manager main UI appears.

browser-use state
PASS: Remote Display (Server group=display) is visible and connected.
PASS: Clients panel still shows Clients (0) in the tested browser state.

browser-use browser_navigate https://localhost:5174/?e2e=1&server=https%3A%2F%2Flocalhost%3A3001
PASS: client page opens in e2e mode.

server log
BLOCKED: a normal client registers, then disconnects and expires; no stable audience client remains for GS-12 live
gyro/flashlight proof.
```

```text
browser-use Manager: select Display group and click Send Color
FAIL: display page remains black.

server log
FAIL: control message rejected:
code=server.policy.scope_mismatch
path=target.groupId
message="target group must match scopeGroupId"
```

## Stop Conditions

- Required product proof for GS-12 is still missing: no stable live audience client/device/output scenario was proven.
- Required product proof for GS-13 is still missing: display is connected, but the Manager display control is rejected by
  server policy and no visual output change is observed.
- Fixing the display control rejection requires product/runtime changes outside the active
  `.harness/goals/FF-18-review-contract.md` allowed paths.
- Runtime override set/clear remains explicitly deferred as `RUNTIME_OVERRIDE_SURFACE_NOT_IMPLEMENTED`.
- Browser/runtime proof cannot be replaced by deterministic fixtures.

## Validation Result

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

The fresh `verify` run reached and passed dependency guards, lint, build, node-core tests, FF-08 tests, FF-09 tests,
node spec validation, offline node-executor e2e, and FF-08 Manager boundary guard before failing on the same out-of-scope
hotspot:

```text
apps/server/src/assets/assets.service.ts: 498 lines exceeds ratchet max 492
```

## Next Valid Path

Choose one:

- revise the FF-18 contract before touching `apps/server/**`, Manager product control wiring, client runtime, or display
  runtime;
- approve a dated risk acceptance for the missing FF-18 product proof;
- keep FF-18 blocked and do not start FF-19.
