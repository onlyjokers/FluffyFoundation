<!--
Purpose: Define mandatory gates for tasks, PRs, review, AI, UI, runtime, security, and release readiness.
-->

# Quality Gates

## Universal Task Gate

Every task must state:

- `PLAN ID`: one `FF-*` item from [PLAN.md](PLAN.md)
- Boundary: files/directories allowed to change
- Non-goals
- Verification commands
- Expected evidence artifacts
- Rollback or recovery path
- Whether semantic Canvas/CLI/API parity is affected
- Whether AI visibility/policy/audit is affected

## PR Gate

Every PR must include:

- Summary
- PLAN ID
- Product/architecture impact
- Commands run with results
- Scenario evidence or reason not applicable
- UI evidence for visible changes
- Security/privacy impact
- AI Operator impact
- Risk and rollback

## Review Gate

Reviewer must:

- Inspect the diff and relevant source of truth docs.
- Run or verify the named checks.
- For UI/runtime changes, inspect real behavior through browser, CLI, trace, or executable scenario.
- For semantic graph changes, verify Canvas/CLI/API/AI command parity or explicitly block.
- For authority changes, include denial tests.
- For Display/Client/NodeExecutor changes, verify status/error reporting, not only happy path.

## AI Feature Gate

AI-related work must prove:

- AI receives semantic graph context, not UI layout noise.
- Registry metadata is sufficient and compact.
- Commands use command bus and policy.
- Dry-run validation precedes execution.
- Audit/history/rollback are emitted.
- Secrets and irrelevant private data are redacted.
- Cost/rate budgets exist.
- Prompt injection through node descriptions/external input is considered.

## UI Gate

UI changes must prove:

- Text fits at mobile and desktop sizes.
- Critical controls have disabled/loading/error states.
- Runtime failures are visible to the operator.
- No semantic behavior is implemented only in a Svelte component.
- Root-only heavy editor code is not pulled into Manager performance UI.

## Runtime And Realtime Gate

Realtime/control changes must prove:

- Delivery class: reliable, latest-state, volatile, or scheduled.
- Drop/coalesce behavior is observable.
- Scope and actor are preserved.
- Errors use structured reports.
- Stop/recover path exists.

## Release Gate

No public or show-use release before:

- Golden scenarios pass.
- Production config validation passes.
- Manager auth and CORS fail closed.
- Stop-all/safe-mode drills pass.
- Rollback procedure is tested.
- Observability dashboard/reporting covers latency, traffic, errors, saturation, drops, device readiness, display readiness, and partition status.
