<!--
Purpose: Track the active harness task for Looooper Plan/Work/Review sessions.
-->

# Current Task

FF-18 - AI Operator Semantic Runtime

## Previous Acceptance

FF-17 Plugin Host And Capability Lifecycle was accepted and committed as `111103f` (`Add plugin host lifecycle`).

## Current Boundary

AI Operator Semantic Runtime scope from `docs/harness/PLAN.md`:

- AI intent pipeline: semantic snapshot pack, registry summary, permission context, validation reports, planner,
  proposal, dry-run, execute, observe, repair loop.
- AI can add nodes, remove/archive nodes, connect/disconnect, modify params, insert mapping/normalize nodes, adjust
  Group internals, deploy/stop partitions, and produce human approval proposals.
- AI never consumes canvas layout noise as primary context.
- AI reports exact command sequence, expected output change, risk, rollback, and observed result.

Allowed future FF-18 implementation lanes:

- AI intent pipeline, semantic snapshot pack, registry summaries, permission context, validation reports, planner,
  proposal, dry-run, execute, observe, and repair loop
- Semantic command bus integration only; AI, Canvas, CLI, and external API must call the same command bus/API layer
- Node Registry summaries and AI-readable node definitions needed for compact semantic context
- Policy, validation, audit, history, rollback, redaction, and structured observation hooks required for every
  AI-visible mutation
- Command bus parity for add/archive/restore nodes, connect/disconnect, params, Groups, ownership/transfer, deploy,
  stop, runtime overrides, proposal approval, and rollback where touched
- AI package/contract lanes described by `docs/harness/BOUNDARIES.md`; no direct Canvas/Rete mutation or secret access
- `docs/harness/**` only for FF-18 policy/evidence/ADR references
- `.harness/status/current-phase.md`
- `.harness/status/current-task.md`
- `.harness/handoffs/**`
- `.harness/evidence/FF-18/**`

## Non-Goals

- Do not implement FF-18 feature behavior during this status transition.
- Do not begin FF-19 safety/cost/provider work except where FF-18 requires policy, validation, audit, rollback, and
  redaction hooks for AI-visible mutation.
- Do not allow AI to consume Canvas UI layout noise as primary context.
- Do not add direct AI mutation paths into Svelte components, Canvas/Rete internals, transport handlers, or plugin
  lifecycle code.
- Do not touch package source, app source, lockfiles, ignored runtime output, build artifacts, `.looooper/workflow.yaml`,
  `.claude/`, `.gitnexus/`, or `CLAUDE.md` as part of this transition.

## Verification Expectations

FF-18 implementation dispatches must satisfy `docs/harness/PLAN.md`, `docs/harness/QUALITY-GATES.md`,
`docs/harness/BOUNDARIES.md`, and `docs/harness/AI-OPERATOR.md`:

- Natural-language scenario where gyro rotation drives a tense flashlight rhythm through graph commands.
- Natural-language scenario where a display visual becomes breathing-like and the AI observes the output change.
- AI repair scenario for param overflow or incompatible connection using structured validation errors.
- AI-visible mutations prove semantic graph context instead of UI layout noise, registry metadata sufficiency, command
  bus use, dry-run validation, policy decision, audit/history/rollback, redaction, and prompt-injection consideration.
- Semantic Canvas/CLI/API/AI parity must be verified or explicitly blocked by Review.

## Work Result

FF-17 has been accepted and committed as `111103f`. FF-18 is now active; this transition updates harness status only
and does not implement AI intent planning, semantic snapshot packing, registry summary generation, policy execution,
validation, audit, rollback, command bus parity, proposal flow, observation, or repair behavior.

## Acceptance Reconciliation

FF-18 completion is currently blocked under `docs/harness/ACCEPTANCE.md` and
`.harness/goals/FF-18-review-contract.md`.

Current evidence proves substantial deterministic in-memory AI Operator behavior, but browser/runtime/product proof is
missing and is not covered by dated risk acceptance. Do not start FF-19 until this is resolved.

## Next Expected Action

The next Plan dispatch must choose one of these paths:

- approve a dated risk acceptance for the missing FF-18 runtime/browser/product proof;
- approve a bounded FF-18 runtime/browser/product proof task that starts with failing tests or executable scenario proof,
  including a scope revision if fixing the current `apps/server/**` startup blocker is required;
- revise the FF-18 contract if the missing proof is intentionally deferred to a later FF item.

## Runtime Browser Investigation Update

2026-05-08 real runtime/browser checking confirms that chrome-devtools MCP and browser-use MCP are available, Manager
and Server are both reachable by `curl -k`, browser-use can render the server health JSON, Manager login reaches the
connect panel as user Eureka, Manager connects to the server with Socket.IO polling HTTP 200, and the Root Node Graph
renders Start/minimap controls.

FF-18 remains blocked because GS-12 and GS-13 still lack product scenario proof: current browser proof only covers
Manager/root reachability, not live gyro/client/device/output behavior or live display visual-output observation.
Runtime override set/clear remains explicitly deferred. Current validation also stops at `harness:hotspots` because
`apps/server/src/assets/assets.service.ts` exceeds its ratchet max; that path is outside the FF-18 review contract
allowed implementation scope.

Evidence: `.harness/evidence/FF-18/runtime-browser-investigation.md`.

## Product Chain Recheck Update

2026-05-08 follow-up runtime checking restarted the local server with `SHUGU_ALLOW_INSECURE_MANAGER=1` and confirmed
that the previous `managers: []` state was runtime configuration: the server grants Manager role and `/clients` reports
non-empty managers plus a connected display client.

FF-18 remains blocked. Browser-use verified that a client e2e page can open, but no stable audience
client/device/output chain remains registered for GS-12. Browser-use also verified that Manager can select Display and
attempt Send Color, but the display stays black while the server rejects the control with
`server.policy.scope_mismatch` at `target.groupId`. Fixing that path would require product/runtime changes in forbidden
paths under the active FF-18 review contract, so Codex must stop instead of modifying them.

Fresh validation after this evidence update:

- `corepack pnpm@8.15.9 harness:validate`: PASS
- `python3 .harness/scripts/validate_acceptance_contracts.py`: PASS
- `git diff --check`: PASS
- `corepack pnpm@8.15.9 verify`: FAIL at the known out-of-scope hotspot
  `apps/server/src/assets/assets.service.ts: 498 lines exceeds ratchet max 492`
