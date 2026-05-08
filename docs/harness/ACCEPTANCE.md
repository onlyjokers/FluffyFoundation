<!--
Purpose: Define Codex-ready acceptance contracts, proof requirements, risk acceptance, and stop conditions for FF items.
-->

# Acceptance Contracts

This file is the completion authority for long-running Codex `/goal` work. It does not replace
[PLAN.md](PLAN.md), [QUALITY-GATES.md](QUALITY-GATES.md), [BOUNDARIES.md](BOUNDARIES.md), or
[VERIFY.md](VERIFY.md). It makes their acceptance rules executable by requiring concrete proof before any `FF-*`
item is reported complete.

## Completion Model

An `FF-*` item is not complete because status files advance, a handoff exists, deterministic fixtures pass, or a
contract test covers part of the behavior.

An `FF-*` item is complete only when all applicable proof is present:

- Implementation evidence: the changed behavior and files are identified against the active `FF-*` contract.
- Validation evidence: required task-specific checks and baseline checks have command output or linked logs.
- Runtime, browser, or product proof: required whenever the claim involves visible UI, live transport, runtime state,
  operator diagnosis, load behavior, release readiness, dogfood readiness, or output change.
- Dated risk acceptance: every intentionally missing proof has a strict dated risk record.
- Status and handoff: `.harness/status/` and `.harness/handoffs/` reflect the reviewed state, not a substitute for
  proof.
- Final report: the implementer states whether the item is `complete`, `incomplete`, or
  `complete-with-dated-risk-acceptance`.

Status transitions, deterministic fixtures, and partial contract tests are proxy signals. They cannot mark an item
complete by themselves.

## Automatic Acceptance Decision Model

Codex has no discretionary acceptance authority. Completion is a machine decision made from the active contract,
proof matrix, diff boundary, validation commands, runtime/browser evidence, and failure fingerprints.

The default decision is `stop`. The decision may change to `complete` only when every machine contract field is
present, every required criterion is `proven`, every required validation command exits 0, every required evidence path
exists, and no stop condition is triggered.

Allowed machine decisions:

- `complete`: all required proof and validation are present and current.
- `incomplete`: the item has useful work but at least one non-blocking proof or report field is missing.
- `stop`: work must stop because proof, validation, scope, risk, or boundary rules failed.

`complete-with-dated-risk-acceptance` is not a free-form Codex judgment. It is allowed only when the active contract
sets `Deferred proof policy` to an allowlisted value and every deferred item satisfies the severity matrix below.

## Adaptive Goal Execution

Long-running Codex `/goal` work may complete a full bounded FF work package in one run. The run may inspect the
runtime, classify blockers, update the active contract, write implementation/tests, collect runtime/browser proof,
update evidence/status/handoff files, and commit the result together.

This is allowed only inside the current `FF-*` item and only when the active contract explicitly authorizes an
adaptive execution lane. The lane must name:

- the exact implementation paths that may change;
- the exact documentation, evidence, status, and handoff paths that may change;
- the proof type that the lane is meant to unblock;
- the tests and browser/runtime checks that must run;
- the stop conditions that still override automatic continuation.

An adaptive lane does not let Codex accept business risk, weaken boundaries, start the next `FF-*` item, or treat
fixtures as runtime proof. It only removes unnecessary human pauses for work that is already inside a named contract
lane.

When an adaptive lane is active, documentation and code changes should normally be committed together after validation
instead of as repeated evidence-only commits. Evidence-only commits are reserved for true stop decisions, rejected scope
expansions, or externally reviewed risk acceptances.

## Machine Contract Fields

Each `.harness/goals/FF-18..FF-24` contract must contain a `## Machine contract` section with these exact fields:

- `Contract ID`
- `Completion decision`
- `Allowed paths`
- `Forbidden paths`
- `Required proof types`
- `Runtime/browser proof`
- `Deferred proof policy`
- `Risk severity policy`
- `Failure fingerprint policy`
- `Next item start policy`
- `Automated validation command`
- `Adaptive execution policy`

The harness validator checks that these fields exist. Future goal-specific validators may parse the field values and
block completion when current diff, proof, validation output, or evidence paths do not match them.

## Automatic Risk Severity Matrix

Risk acceptance is automatic and conservative:

| Severity | Automatic decision |
| --- | --- |
| `blocking` | `stop`; the active FF item cannot be complete. |
| `high` | `stop`; high risk is not auto-accepted. |
| `release-blocking` | `stop` for FF-24 and release gates; earlier items may continue only if the active contract explicitly allowlists that severity. |
| `medium` | `stop` unless the active contract explicitly allowlists the exact risk class and follow-up FF item. |
| `low` | May continue only when the dated risk record is complete, the missing proof is non-runtime or explicitly allowlisted, and the expiry condition is concrete. |

If the risk record does not match the matrix, the decision is `stop`. If the contract does not define an allowlist, the
allowlist is empty.

deferred proof is rejected by default. Browser/runtime/product proof cannot be deferred unless the active contract
explicitly declares the exact proof type as deferrable and maps it to a non-release-blocking follow-up item.

## Failure Fingerprint Gate

Validation failures are pre-existing only when an evidence file records an exact baseline fingerprint before the active
work starts. The fingerprint must include:

- command;
- exit code;
- failing file or gate;
- stable error text or structured failure key;
- baseline evidence path;
- date captured.

If the current failure does not exactly match the baseline fingerprint, Codex must stop. If no baseline exists, Codex
must stop. Codex must not infer that a failure is pre-existing from memory, status files, or similar-looking warnings.

## Browser Runtime Proof Gate

When a criterion requires browser/runtime/product proof, deterministic/unit proof is not a substitute. A valid proof
must include at least one live runtime artifact such as browser-use state, browser HTML, screenshot, trace, runtime log,
server/client/display status, or product scenario output. The artifact path must be listed in the proof matrix.

If browser-use, Playwright, DevTools, or the runtime cannot reach the target page/service, the decision is `stop` unless
the active contract explicitly allows that exact missing runtime proof class and the risk severity matrix permits it.

## Proof Types

Use these proof types consistently:

- `implementation`: source, documentation, or configuration changes that implement the contracted behavior.
- `deterministic`: unit tests, contract tests, static checks, deterministic fixtures, or trace fixtures.
- `runtime-browser`: browser, Playwright, DevTools, screenshots, traces, runtime logs, or live app interaction.
- `product-runtime`: server/client/display/device/operator evidence from a real or realistic runtime path.
- `release-operational`: security scan, release checklist, deployment checklist, backup/restore, incident, or dogfood
  evidence.
- `deferred-risk`: a dated risk acceptance using the required template below.

## Proof Matrix Template

Every `FF-*` final report and evidence summary must include or link a proof matrix in this shape:

| Criterion | Required proof type | Deterministic/unit proof | Runtime/browser proof | Evidence path | Status | Deferred risk acceptance | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Example criterion | deterministic + runtime-browser | command/test/log path or `N/A` | screenshot/trace/runtime log path or `N/A` | `.harness/evidence/FF-xx/...` | `proven` / `missing` / `deferred` / `blocked` | risk note path or `N/A` | concise review note |

Allowed status values:

- `proven`: all required proof exists.
- `missing`: proof is required and absent.
- `deferred`: proof is absent and covered by valid dated risk acceptance.
- `blocked`: the item cannot continue without user or reviewer decision.

## Dated Risk Acceptance Template

Use this exact structure whenever proof is intentionally deferred:

```md
## Dated Risk Acceptance

Risk:
Owner:
Date:
Missing proof:
Why it is safe to continue:
Follow-up FF item:
Blocking severity: blocking | non-blocking | release-blocking
Expiry/revisit condition:
```

Rules:

- `Date` must be an absolute date.
- `Owner` cannot be only `Codex`; use the reviewer, project owner, or mark owner missing and block.
- `Follow-up FF item` must be an `FF-*` item or `N/A` with explanation.
- `blocking` means the active `FF-*` item cannot be marked complete.
- `release-blocking` may allow current continuation but must block FF-24 production launch readiness.

## Stop Conditions

Codex must stop and report instead of continuing when any of these are true:

- Required runtime, browser, or product proof is missing and no valid dated risk acceptance exists.
- Validation fails and the failure cannot be proven pre-existing or intentionally deferred.
- The work requires product/runtime code outside the active `FF-*` contract.
- Hotspot ratchets, dependency boundaries, policy, audit, rollback, redaction, security, or release checks would need to
  be weakened.
- The implementation would require starting the next `FF-*` item.
- Browser/runtime proof is being substituted with deterministic fixtures.
- Existing status files claim progress that evidence does not prove.
- Security, policy, audit, rollback, or redaction guarantees would be reduced.
- A provider, package, persistence engine, protocol-breaking change, or deployment change is needed without the ADR or
  evidence required by the harness.

## Final Report Requirements

Every `FF-*` final report must include:

- Final state: `complete`, `incomplete`, or `complete-with-dated-risk-acceptance`.
- Files changed.
- Commands run and pass/fail results.
- Proof matrix or link to it.
- Evidence paths.
- Dated risk acceptances, if any.
- Stop-condition review: either `none triggered` or a list of triggered conditions.
- Whether the next `FF-*` item may start.
