<!--
Purpose: Define local and CI verification commands for harness, architecture, and product-readiness checks.
-->

# Verification

## Harness-Only

```bash
pnpm harness:validate
pnpm harness:hotspots
pnpm harness:verify
```

`harness:validate` checks required harness files, PLAN IDs, status pointers, Looooper file references, package scripts, and basic local markdown links.

`harness:hotspots` freezes current large files so they cannot grow without an approved split task.

## Product Baseline

```bash
pnpm guard:deps
pnpm lint
pnpm build:all
pnpm validate:node-specs
pnpm test:node-core
pnpm e2e:node-executor:offline
```

## Target Unified Gate

```bash
pnpm verify
```

`pnpm verify` is intentionally strict. If it fails during early harness adoption, the active task should either fix the failure or record a dated, scoped risk acceptance in the handoff.

## Evidence Artifacts

Use `.harness/evidence/<FF-ID>/<YYYY-MM-DD>-<short-name>/` for:

- command logs
- screenshots
- Playwright traces
- load reports
- bundle reports
- structured validation reports
- AI proposal/execution traces
- reviewer notes

Do not commit large binary artifacts unless the phase explicitly requires it; upload them as CI artifacts or keep a small text summary in git.
