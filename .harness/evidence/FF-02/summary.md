<!--
Purpose: Summarize FF-02 topology ownership, hotspot ratchet, dependency guard, CODEOWNERS, and proof evidence.
-->

# FF-02 Evidence Summary

## Scope

FF-02 tightens architecture governance without changing runtime behavior.

Changed surfaces:

- `.harness/hotspots-allowlist.json`
- `scripts/guard-deps.mjs`
- `CODEOWNERS`
- `docs/harness/BOUNDARIES.md`
- `.harness/status/current-phase.md`
- `.harness/status/current-task.md`
- `.harness/handoffs/2026-05-03-FF-02-topology-ownership.md`

## Hotspot Ratchet

- `block_unlisted` is now `400`, matching the split-required threshold.
- Every current source file at or above 400 lines is allowlisted with its current `max_lines`.
- Future changes may shrink or split these files freely, but growth beyond the frozen max fails `pnpm harness:hotspots`.

Proof:

```text
pnpm harness:hotspots
[hotspots] PASS: hotspot ratchet satisfied
```

## Dependency And Boundary Guard

`scripts/guard-deps.mjs` now enforces:

- public package export boundaries for `@shugu/*` imports;
- undeclared package dependencies for package workspaces;
- package-to-app import bans;
- server-to-UI/runtime app import bans;
- protocol-to-higher-package import bans;
- lane allowlists for Root, Manager, Display, Client, Server, SDK, AI, Plugin, Persistence, and Topology paths.

Proof:

```text
pnpm guard:deps
[deps-guard] ok (661 files scanned)
[server-msg-guard] ok (35 files scanned)
```

## Negative Import Proof

Work temporarily added `packages/ai-core/src/ff02-invalid-dependency-fixture.ts`:

```ts
import type { ClientSDK } from '@shugu/sdk-client/src/client-sdk';
```

Expected failure:

```text
[deps-guard] violations found:
- packages/ai-core/src/ff02-invalid-dependency-fixture.ts:4:1 Deep import not allowed: @shugu/sdk-client/src/client-sdk (allowed: , client-sdk)
[deps-guard] total: 1 issue(s)
```

The fixture was removed immediately after the proof, generated `dist-ai-core/ff02-invalid-dependency-fixture.*`
artifacts were removed, and `pnpm guard:deps` was rerun successfully.

## Full Verification

Final Work checks:

```text
pnpm verify
exit 0
```

`pnpm verify` completed guard, lint, build, node-core tests, node-spec validation, offline node-executor e2e, and
harness verification. It retained existing warnings from ESLint/Svelte build/node-spec validation, but no command
failed.

```text
git diff --check
exit 0
```

```text
git status --short --branch
## master...origin/master [ahead 5]
 M .harness/hotspots-allowlist.json
 M .harness/status/current-phase.md
 M .harness/status/current-task.md
 M docs/harness/BOUNDARIES.md
 M scripts/guard-deps.mjs
?? CODEOWNERS
```

The evidence and handoff files are intentionally under `.harness/evidence/FF-02/` and `.harness/handoffs/`, which the
repo currently ignores via `.gitignore`. Review must force-add them if the FF-02 evidence/handoff should be committed.

## CODEOWNERS

Root `CODEOWNERS` was added because the repo had no existing `CODEOWNERS` or `.github/CODEOWNERS` convention.

Plan approved local placeholder handles:

- `@shugu/architecture`
- `@shugu/security`
- `@shugu/ai`
- `@shugu/server`
- `@shugu/ui`
- `@shugu/protocol`
- `@shugu/runtime`
- `@shugu/release`

These are placeholder local ownership handles. They must be replaced with real GitHub users or teams before repository
protection relies on CODEOWNERS enforcement.

## Topology Policy

`docs/harness/BOUNDARIES.md` now requires:

- purpose headers at the top of every new source file;
- package-level purpose in `package.json` for every new workspace package;
- an ADR or harness policy update before topology changes that add packages, add exports, change dependency direction,
  move lane ownership, or expand hotspot allowances.
