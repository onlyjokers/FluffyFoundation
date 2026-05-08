<!--
Purpose: Handoff the clean FF-18 runtime/browser recheck after Manager socket and Root Node Graph verification.
-->

# FF-18 Runtime Browser Clean Recheck Handoff

Date: 2026-05-08

## Summary

FF-18 remains incomplete. Do not start FF-19.

The earlier browser Manager Socket.IO certificate blocker is no longer current in the clean local recheck. Server
health renders in browser-use, Manager connects to the server, Socket.IO polling returns HTTP 200 in chrome-devtools,
and the Root Node Graph renders. This improves runtime/browser evidence but does not complete GS-12 or GS-13.

## Evidence

- `.harness/evidence/FF-18/runtime-browser-investigation.md`
- `.harness/evidence/FF-18/acceptance-reconciliation.md`
- `.harness/evidence/FF-18/summary.md`
- `.harness/evidence/FF-18/root-node-graph-2026-05-08.png`
- `.harness/status/current-task.md`

## Browser Runtime Result

```text
curl -k -I https://localhost:3001/health
PASS: HTTP/1.1 200 OK

curl -k -I https://localhost:5173/manager/
PASS: HTTP/2 200

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
```

No manager key or password is recorded in evidence.

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

The failing hotspot is:

```text
apps/server/src/assets/assets.service.ts: 498 lines exceeds ratchet max 492
```

## Stop Conditions

- Required product proof for GS-12 is still missing: no live gyro/client/device/output scenario has been executed.
- Required product proof for GS-13 is still missing: no live display visual-output scenario has been observed.
- Runtime override set/clear remains explicitly deferred as `RUNTIME_OVERRIDE_SURFACE_NOT_IMPLEMENTED`.
- Browser/runtime proof cannot be replaced by deterministic fixtures.
- `pnpm verify` previously failed on a hotspot ratchet in `apps/server/**`; that path is outside the active
  `.harness/goals/FF-18-review-contract.md` allowed paths unless the contract is explicitly revised.

## Next Valid Path

Choose one:

- revise the FF-18 contract to allow bounded product scenario proof work for GS-12/GS-13;
- approve a dated risk acceptance for the missing FF-18 product proof;
- keep FF-18 blocked and do not start FF-19.
