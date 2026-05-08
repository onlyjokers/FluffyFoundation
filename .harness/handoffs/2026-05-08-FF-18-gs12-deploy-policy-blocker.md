<!--
Purpose: Handoff the FF-18 GS-12 runtime recheck and remaining deployment policy blocker.
-->

# FF-18 GS-12 Deploy Policy Blocker Handoff

Date: 2026-05-08

## Status

FF-18 remains incomplete. Do not start FF-19.

This handoff records a runtime-only GS-12 recheck. No source files were modified to produce the proof.

## Runtime Proof

```text
SHUGU_ALLOW_INSECURE_MANAGER=1 corepack pnpm@8.15.9 dev:server
PASS: local server listens on https://localhost:3001 and grants Manager role.

browser-use client e2e page
PASS: a normal audience client remains registered and connected in /clients.

chrome-devtools Manager /manager/root -> Connect -> Node Graph
PASS: Manager exposes window.__shuguNodeEngine.

chrome-devtools runtime-only graph load
PASS: loaded client-object -> proc-client-sensors gyroG -> proc-flashlight frequencyHz -> client-object.
PASS: Manager detects one local loop requiring flashlight and sensors.
```

## Blocker

```text
chrome-devtools click Deploy
FAIL: server rejects node-executor deploy.

server log:
code=server.policy.scope_mismatch
path=target.mode
message="scoped commands must target their scope group"
```

The current blocker is not unstable client registration. The current blocker is the live deploy path: Manager Node Graph
loop deploy sends a client-targeted `node-executor` plugin command, while server ingress policy requires scoped manager
mutating commands to target their scope Group.

## Scope Impact

Fixing this path is outside the current FF-18 review contract because it would require changing one of:

- `apps/manager/src/lib/components/nodes/**` loop deployment behavior;
- broader `apps/server/**` command-scope policy;
- a new approved product-proof scope lane.

Codex must stop under the current contract instead of modifying those paths.

## Remaining Acceptance

- GS-12: blocked by Node Graph deploy policy.
- GS-13: partial; bounded Manager Published Display `screenColor` product chain is proven, but full breathing-like AI
  scenario and AI observation loop are not product-proven.
- Runtime override set/clear: still deferred as `RUNTIME_OVERRIDE_SURFACE_NOT_IMPLEMENTED` without dated risk
  acceptance.
