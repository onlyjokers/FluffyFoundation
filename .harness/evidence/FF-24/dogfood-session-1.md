<!--
Purpose: FF-24 first dogfood rehearsal report with real runtime proof and recovery notes.
-->

# FF-24 Dogfood Session 1

Date: 2026-05-09
Release candidate: `8edc070`
Runtime proof: real

## Scenario

Release-candidate validation rehearsal focused on the operator path after FF-23. The session used real repository
commands against the current checkout, not synthetic evidence.

## Commands Run

- `corepack pnpm@8.15.9 test:ff23`
- `python3 .harness/scripts/validate_acceptance_contracts.py`
- `git diff --check`
- `corepack pnpm@8.15.9 verify`
- `curl -k -sS https://localhost:3001/health`

## Observed Result

The FF-23 release/security gate passed. Acceptance contract validation and whitespace checks passed. Full verification
ran through guard, lint, build, node-core tests, FF-08, FF-09, node-spec validation, offline node-executor e2e, and
Manager boundary checks before stopping at the known hotspot ratchet.

Server runtime health returned `status=ok`, `mode=single-server`, `assets.ok=true`, `writeConfigured=true`, and
`assetCount=9` from `https://localhost:3001/health`.

## Recovery notes:

No runtime recovery was needed. The only blocking output was the exact known hotspot fingerprint:
`apps/server/src/assets/assets.service.ts: 498 lines exceeds ratchet max 492`. The rehearsal kept the hotspot ratchet
intact and did not weaken policy, security, audit, rollback, or redaction gates.
Runtime proof: real
