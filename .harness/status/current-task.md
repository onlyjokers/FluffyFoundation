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

## Next Expected Action

The next Plan dispatch may start bounded FF-18 Work from `docs/harness/PLAN.md` using the boundary above.
