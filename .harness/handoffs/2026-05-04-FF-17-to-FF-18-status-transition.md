<!--
Purpose: Record the harness-only status transition from FF-17 acceptance to FF-18 activation.
-->

# FF-17 to FF-18 Status Transition

## Previous Acceptance

FF-17 Plugin Host And Capability Lifecycle was accepted and committed as `111103f` (`Add plugin host lifecycle`).

## Next Active Task

`FF-18 - AI Operator Semantic Runtime`

## FF-18 Boundary Preserved

FF-18 keeps the scope from `docs/harness/PLAN.md`:

- AI intent pipeline: semantic snapshot pack, registry summary, permission context, validation reports, planner,
  proposal, dry-run, execute, observe, repair loop.
- AI can add nodes, remove/archive nodes, connect/disconnect, modify params, insert mapping/normalize nodes, adjust
  Group internals, deploy/stop partitions, and produce human approval proposals.
- AI never consumes canvas layout noise as primary context.
- AI reports exact command sequence, expected output change, risk, rollback, and observed result.

## Allowed Future Implementation Lanes

- AI intent pipeline, semantic snapshot pack, registry summaries, permission context, validation reports, planner,
  proposal, dry-run, execute, observe, and repair loop.
- Semantic command bus integration only; AI, Canvas, CLI, and external API must call the same command bus/API layer.
- Node Registry summaries and AI-readable node definitions needed for compact semantic context.
- Policy, validation, audit, history, rollback, redaction, and structured observation hooks required for every
  AI-visible mutation.
- Command bus parity for add/archive/restore nodes, connect/disconnect, params, Groups, ownership/transfer, deploy,
  stop, runtime overrides, proposal approval, and rollback where touched.
- AI package/contract lanes described by `docs/harness/BOUNDARIES.md`; no direct Canvas/Rete mutation or secret access.

## Non-Goals

- This transition does not implement FF-18 feature behavior.
- Do not begin FF-19 safety/cost/provider work except where FF-18 requires policy, validation, audit, rollback, and
  redaction hooks for AI-visible mutation.
- Do not allow AI to consume Canvas UI layout noise as primary context.
- Do not add direct AI mutation paths into Svelte components, Canvas/Rete internals, transport handlers, or plugin
  lifecycle code.
- Do not touch package source, app source, lockfiles, ignored runtime output, build artifacts, `.looooper/workflow.yaml`,
  `.claude/`, `.gitnexus/`, or `CLAUDE.md` as part of this transition.

## Verification Expectations

Future FF-18 Work must follow `docs/harness/PLAN.md`, `docs/harness/QUALITY-GATES.md`,
`docs/harness/BOUNDARIES.md`, and `docs/harness/AI-OPERATOR.md` because FF-18 touches AI, Node Registry summaries,
semantic graph snapshots, command bus parity, policy, validation, audit, and rollback.

Expected FF-18 verification includes:

- Natural-language scenario where gyro rotation drives a tense flashlight rhythm through graph commands.
- Natural-language scenario where a display visual becomes breathing-like and the AI observes the output change.
- AI repair scenario for param overflow or incompatible connection using structured validation errors.
- AI-visible mutation proof for semantic graph context, registry metadata sufficiency, command bus use, dry-run
  validation, policy decision, audit/history/rollback, redaction, and prompt-injection consideration.
- Semantic Canvas/CLI/API/AI parity verification or an explicit Review block.

## Transition Verification

Required for this harness-only transition:

- `git diff --check`
- `pnpm harness:validate` if practical
- `git status --short --branch`
