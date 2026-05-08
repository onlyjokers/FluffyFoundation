<!--
Purpose: Handoff the FF-18 hotspot decomposition and latest runtime/browser blocker evidence.
-->

# FF-18 Hotspot And Runtime Update Handoff

Date: 2026-05-08

## Summary

FF-18 remains incomplete. Do not start FF-19.

The FF-18 deterministic AI/node-core helper files were decomposed so the active FF-18 changes no longer create new
large helper hotspots. Runtime/browser proof was retried with browser-use and chrome-devtools. Manager and Server are
reachable, and Manager login reaches the connect panel, but the browser cannot establish the Manager Socket.IO
connection because requests to `https://localhost:3001/socket.io` fail with certificate authority errors.

## Evidence

- `.harness/evidence/FF-18/summary.md`
- `.harness/evidence/FF-18/acceptance-reconciliation.md`
- `.harness/evidence/FF-18/runtime-browser-investigation.md`
- `.harness/status/current-task.md`

## Commands And Results

```text
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

Remaining hotspot failure:

```text
apps/server/src/assets/assets.service.ts: 498 lines exceeds ratchet max 492
```

## Browser Runtime Result

```text
curl -k -I https://localhost:3001/health
PASS: HTTP/1.1 200 OK

curl -k -I https://localhost:5173/manager/
PASS: HTTP/2 200

browser-use browser_navigate https://localhost:5173/manager/
PASS: browser opened the Manager URL.

chrome-devtools fill_form + Login
PASS: authenticated to the Manager connect panel as user Eureka.

chrome-devtools click Connect
FAIL: page shows "Failed to connect. Please check the server URL."

chrome-devtools network
FAIL: Socket.IO polling to https://localhost:3001/socket.io/?role=manager... fails with NET::ERR_CERT_AUTHORITY_INVALID.
```

No manager key or password is recorded in evidence.

## Stop Conditions

- Required runtime/browser/product proof for GS-12 and GS-13 is still missing.
- Browser/runtime proof cannot be replaced by deterministic fixtures.
- `pnpm verify` fails on a hotspot ratchet in `apps/server/**`.
- Fixing the remaining hotspot or the browser socket certificate path would require scope outside the active
  `.harness/goals/FF-18-review-contract.md` allowed paths unless the contract is explicitly revised.

## Next Valid Path

Choose one:

- revise the FF-18 contract to allow a bounded runtime/browser proof fix, starting with failing tests or executable
  scenario proof;
- approve a dated risk acceptance for the missing FF-18 runtime/browser/product proof;
- keep FF-18 blocked and do not start FF-19.
