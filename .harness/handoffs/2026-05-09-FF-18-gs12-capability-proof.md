<!--
Purpose: Handoff for the FF-18 GS-12 client capability/runtime proof update.
-->

# FF-18 GS-12 Capability Runtime Proof Handoff

Date: 2026-05-09

## Status

FF-18 remains incomplete. Do not start FF-19.

GS-12 deploy/capability proof is no longer the active blocker. The approved adaptive client e2e/runtime proof lane now
proves both:

- camera-denied runtime rejects flashlight deploy as `Deploy failed: missing required capabilities: flashlight` without
  falling through to `Deploy timeout`;
- explicit DEV e2e proof mode deploys the GS-12 loop and records a real client NodeExecutor `flashlight` command.

## Files Changed

- `apps/manager/src/lib/components/nodes/node-canvas/controllers/loop-helpers.ts`
- `apps/manager/src/lib/components/nodes/node-canvas/controllers/loop-helpers.spec.ts`
- `apps/client/src/lib/stores/client/client-runtime.ts`
- `apps/client/src/lib/stores/client/client-runtime-capabilities.ts`
- `apps/client/src/lib/stores/client/client-runtime.spec.ts`
- `.harness/evidence/FF-18/runtime-browser-investigation.md`
- `.harness/evidence/FF-18/acceptance-reconciliation.md`
- `.harness/goals/FF-18-review-contract.md`
- `.harness/status/current-task.md`

## Validation

Deterministic:

```text
wc -l apps/client/src/lib/stores/client/client-runtime.ts apps/client/src/lib/stores/client/client-runtime-capabilities.ts
PASS: client-runtime.ts is 413 lines after pure capability-helper extraction, below the hotspot ratchet.

corepack pnpm@8.15.9 exec tsx --test apps/manager/src/lib/components/nodes/node-canvas/controllers/loop-helpers.spec.ts
PASS: 5 tests, 0 failures

corepack pnpm@8.15.9 exec tsx --test apps/client/src/lib/stores/client/client-runtime.spec.ts
PASS: 2 tests, 0 failures
```

Runtime/browser:

```text
Negative proof
PASS: live Manager/Client/Server deploy reaches client NodeExecutor.
PASS: camera-denied client rejects flashlight capability.
PASS: Manager reports "Deploy failed: missing required capabilities: flashlight".
PASS: Manager does not report "Deploy timeout".
PASS: no flashlight command executes after rejection.

Positive proof
PASS: explicit DEV e2e proof flag is set on the client page.
PASS: live Manager/Client/Server deploy reaches client NodeExecutor.
PASS: client NodeExecutor reports deployed.
PASS: Manager UI reports Remote running/deployed and Stop Loop.
PASS: client e2e command capture records action="flashlight".
```

## Remaining Blockers

- GS-13 remains partial: the bounded Manager Published Display `screenColor` product chain is proven, but the full
  breathing-like AI scenario and AI observation loop are not product-proven.
- `pnpm verify` is expected to fail at the known out-of-scope hotspot
  `apps/server/src/assets/assets.service.ts: 498 lines exceeds ratchet max 492` unless that baseline changes.

## Runtime Override Follow-up

The later 2026-05-09 FF-18 runtime override semantic surface update removed the prior
`RUNTIME_OVERRIDE_SURFACE_NOT_IMPLEMENTED` blocker from deterministic command-surface proof:

- `runtime.override.set` and `runtime.override.clear` now dispatch through `@shugu/node-core` semantic command bus.
- The commands validate node id, port id, and ttl boundaries.
- The commands record `runtimeStatus.runtimeOverrides`, audit/history/revision, and rollback metadata.
- `@shugu/ai-core` WP8 traces now prove the runtime override surfaces through the executable command-bus parity path.

This does not claim browser/live Manager `patch-runtime.ts` delivery proof.

## Next Action

Continue FF-18 only. Complete the full GS-13 AI observation product proof, or create a strict dated risk acceptance if
the user approves deferral. Do not begin FF-19.
