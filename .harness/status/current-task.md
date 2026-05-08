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

The next Plan dispatch must choose one of these paths. The currently actionable implementation path is the bounded
GS-12 deploy lane requested in `.harness/evidence/FF-18/contract-revision-request.md`; it is not approved yet.

- approve the bounded FF-18 GS-12 deploy lane before touching Node Graph loop deployment, broader server policy, SDK
  command-envelope behavior, or related product/runtime code;
- approve a dated risk acceptance for the remaining missing FF-18 runtime/browser/product proof;
- reject the GS-12 deploy lane and keep FF-18 blocked;
- revise the FF-18 contract if the missing proof is intentionally deferred to a later FF item.

Until the GS-12 deploy lane is approved, Codex must not modify `apps/manager/src/lib/components/nodes/**`,
`apps/server/**` outside the already approved files, `apps/client/**`, `apps/display/**`, or start FF-19.

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

## Approved Product-Proof Lane Update

The user approved a 2026-05-08 bounded product-proof lane revision for FF-18. Within that revised contract, Codex fixed
the Manager Published Display control chain without weakening server policy:

- SDK Manager group-targeted controls and plugin controls now scope command envelopes to the target Group.
- Manager Published Group controls send `node-executor/reclaim` for the selected Group before mutating controls.
- Browser-use verified Manager `/manager/` -> Display published Group -> Send Color.
- Server logs accepted `node-executor/reclaim` and `screenColor` with `actor=Eureka`, `role=manager`,
  `scopeGroupId=display`, and `target={ mode: 'group', groupId: 'display' }`.
- Display changed from black to a full-viewport blue-purple screen.

This converts GS-13 from blocked to partial: the bounded Manager-to-Display product chain is proven, but the full
breathing-like AI scenario and AI observation loop are not product-proven.

FF-18 is still incomplete. Do not start FF-19. GS-12 still lacks stable audience client/device/output proof, and runtime
override set/clear remains deferred as `RUNTIME_OVERRIDE_SURFACE_NOT_IMPLEMENTED` without dated risk acceptance.

Fresh validation after this evidence update:

- `corepack pnpm@8.15.9 harness:validate`: PASS
- `python3 .harness/scripts/validate_acceptance_contracts.py`: PASS
- `git diff --check`: PASS
- `corepack pnpm@8.15.9 verify`: FAIL at the known out-of-scope hotspot
  `apps/server/src/assets/assets.service.ts: 498 lines exceeds ratchet max 492`

## GS-12 Runtime Recheck Update

2026-05-08 runtime-only recheck narrows the remaining GS-12 blocker:

- Browser-use confirmed a normal audience client can remain registered and connected in `/clients`.
- Chrome DevTools confirmed Manager Node Graph can load a GS-12-shaped runtime graph:
  `client-object -> proc-client-sensors gyroG -> proc-flashlight frequencyHz -> client-object`.
- Manager detects a local loop requiring `flashlight` and `sensors`.
- Clicking Deploy is rejected by server policy:
  `server.policy.scope_mismatch`, `path=target.mode`, `message="scoped commands must target their scope group"`.

This is a stop condition under the current FF-18 contract. Fixing it would require changing Node Graph loop deployment
under `apps/manager/src/lib/components/nodes/**`, broader server policy, or another explicitly approved product-proof
lane. FF-18 remains incomplete; do not start FF-19.

## Approved GS-12 Deploy Lane Fix Update

The user approved the bounded FF-18 GS-12 deploy lane. Within that revised contract, Codex fixed the Node Graph loop
deploy path without weakening server scope, ownership, audit, rollback, security, or hotspot boundaries:

- Normal clients without an explicit group are registered into a managed per-client Group: `client:<clientId>`.
- Node Graph loop deploy/stop/remove now target the managed client Group instead of `clientIds`.
- Node Graph loop deploy sends `node-executor/reclaim` before `node-executor/deploy` so the Manager owns the
  transferable managed client Group before mutating it.
- Server command-envelope tests prove managed client Group deploy is accepted and audited.
- Runtime/browser recheck against current source on `https://localhost:3301` proves the server accepts
  `node-executor/reclaim` and `node-executor/deploy` with
  `target={ mode: 'group', groupId: 'client:<clientId>' }` and matching `scopeGroupId`.

FF-18 is still incomplete. Do not start FF-19. The current GS-12 blocker is no longer server scope/ownership; it is
capability/runtime product proof: the desktop e2e client used for verification does not advertise `flashlight`, so live
flashlight command execution remains unproven. Runtime override set/clear also remains deferred as
`RUNTIME_OVERRIDE_SURFACE_NOT_IMPLEMENTED` without dated risk acceptance.

Fresh validation after this fix:

- `corepack pnpm@8.15.9 exec tsx --test apps/manager/src/lib/components/nodes/node-canvas/controllers/loop-helpers.spec.ts`: PASS, 4 tests, 0 failures
- `corepack pnpm@8.15.9 exec tsx --tsconfig apps/server/tsconfig.json --test apps/server/src/events/events.gateway.spec.ts`: PASS, 7 tests, 0 failures
- `corepack pnpm@8.15.9 exec tsx --tsconfig apps/server/tsconfig.json --test apps/server/src/events/events.gateway.command-envelope.spec.ts`: PASS, 11 tests, 0 failures
- `corepack pnpm@8.15.9 exec tsx --test packages/sdk-manager/src/manager-sdk.spec.ts`: PASS, 13 tests, 0 failures
- `corepack pnpm@8.15.9 --filter @shugu/server run build`: PASS
- `corepack pnpm@8.15.9 --filter @shugu/manager run build`: PASS with existing Svelte/Sass/Rete warnings
- `python3 .harness/scripts/validate_acceptance_contracts.py`: PASS
- `git diff --check`: PASS
- `corepack pnpm@8.15.9 harness:verify`: FAIL at known out-of-scope hotspot
  `apps/server/src/assets/assets.service.ts: 498 lines exceeds ratchet max 492`
- `corepack pnpm@8.15.9 verify`: FAIL at the same known out-of-scope hotspot after dependency guards, lint, build,
  node-core tests, FF-08 tests, FF-09 tests, node spec validation, offline node-executor e2e, and FF-08 Manager
  boundary guard pass
