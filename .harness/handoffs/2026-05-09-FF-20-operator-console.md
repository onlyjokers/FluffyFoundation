<!--
Purpose: Handoff FF-20 observability, reporting, and operator-console implementation status.
-->

# FF-20 Operator Console Handoff

## Status

FF-20 implementation is complete with exact baseline validation fingerprint.

Implemented inside the active contract lanes:

- `apps/manager/src/lib/stores/domain/operator-console-types.ts`
- `apps/manager/src/lib/stores/domain/operator-console.ts`
- `apps/manager/src/lib/stores/domain/operator-console-store.ts`
- `apps/manager/src/lib/stores/domain/operator-console.spec.ts`
- `apps/manager/src/lib/components/OperatorConsole.svelte`
- `apps/manager/src/routes/+page.svelte`
- `.harness/evidence/FF-20/**`

## Verification

Focused checks run:

```text
corepack pnpm@8.15.9 exec tsx --test apps/manager/src/lib/stores/domain/operator-console.spec.ts
PASS: 4 tests, 0 failures

corepack pnpm@8.15.9 --filter @shugu/manager run lint
PASS

corepack pnpm@8.15.9 --filter @shugu/manager run build
PASS
```

Runtime/browser proof:

```text
Manager URL: https://localhost:5176/manager/
Server URL: https://localhost:3001
Proof client: real Socket.IO client, role=client, group=display, clientId=ff20-display-proof
Operator Console result: degraded, permission-denial, diagnosed, target group must match scopeGroupId
```

Evidence:

- `.harness/evidence/FF-20/operator-console-runtime-proof.json`
- `.harness/evidence/FF-20/operator-console-runtime-text.txt`
- `.harness/evidence/FF-20/operator-console-runtime-snapshot.md`
- `.harness/evidence/FF-20/summary.md`

Final checks expected/recorded:

```text
python3 .harness/scripts/validate_acceptance_contracts.py
PASS

git diff --check
PASS

corepack pnpm@8.15.9 verify
FAIL only at known exact hotspot baseline:
- apps/server/src/assets/assets.service.ts: 498 lines exceeds ratchet max 492
```

All full-verify stages before `harness:hotspots` passed. Do not weaken the ratchet.

## Notes

- Browser-use MCP was attempted first per project instruction. It could navigate but state/html reads failed with CDP
  initialization errors, so Playwright MCP was used for the runtime proof.
- Localhost certificate warnings were handled by clicking Advanced and continuing to localhost.
- No deferred proof or dated risk acceptance is used.
- FF-21 may start.
