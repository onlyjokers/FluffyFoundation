<!--
Purpose: FF-24 final launch review and production-readiness decision.
-->

# FF-24 Final Launch Review

Final decision: production ready within the harness scope, with no release-blocking risks open.

Explicit blockers:

- none.

Known non-launch blocker:

- The known hotspot ratchet fingerprint remains out of scope for FF-24 launch readiness and is not weakened:
  `apps/server/src/assets/assets.service.ts: 498 lines exceeds ratchet max 492`.

Commands run:

- `corepack pnpm@8.15.9 test:golden`
- `node .harness/evidence/FF-24/validate-launch-readiness.mjs`
- `python3 .harness/scripts/validate_acceptance_contracts.py`
- `git diff --check`
- `corepack pnpm@8.15.9 verify`

Dogfood reports:

- `.harness/evidence/FF-24/dogfood-session-1.md`
- `.harness/evidence/FF-24/dogfood-session-2.md`

## Risk Review

`docs/operations/ACCEPTED-RISKS.json` contains 14 low/moderate accepted risks. Each has owner, date, missing proof,
reason it is safe to continue, follow-up FF item, blocking severity, and expiry/revisit condition. No high, blocking,
or release-blocking risk is accepted.

## Evidence

- Operator manual: `docs/operations/OPERATOR-MANUAL.md`
- Developer guide: `docs/operations/DEVELOPER-GUIDE.md`
- Golden output: `.harness/evidence/FF-24/test-golden-output.txt`
- Launch readiness report: `.harness/evidence/FF-24/launch-readiness-report.json`
- Manager browser proof: Playwright MCP opened `https://localhost:5179/manager/`, title `Fluffy Core Manager`.
- Display browser proof: Playwright MCP opened `https://localhost:5178/display/`, title `ShuGu Display`; console showed
  SDK connection and display registration.
- Server runtime proof: `https://localhost:3001/health` returned `status=ok`.
- Client browser proof: independent Playwright context with `ignoreHTTPSErrors: true` opened
  `https://localhost:5177/?server=https%3A%2F%2Flocalhost%3A3001`, title `Fluffy Foundation`, body sample `Enter`.
- Client browser proof artifacts:
  - `.harness/evidence/FF-24/client-browser-proof.json`
  - `.harness/evidence/FF-24/client-browser-proof.png`
