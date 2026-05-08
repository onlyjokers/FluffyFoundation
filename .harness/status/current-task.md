<!--
Purpose: Track the active harness task for Looooper Plan/Work/Review sessions.
-->

# Current Task

FF-19 - AI Safety, Policy, Cost, Redaction, And Audit

## Previous Acceptance

FF-18 AI Operator Semantic Runtime was accepted with exact baseline validation fingerprint after the GS-12 runtime
proof lane, runtime override semantic surface, and GS-13 Display modulation runtime proof lane.

## Current Boundary

FF-19 scope from `docs/harness/PLAN.md` and `.harness/goals/FF-19-contract.md`:

- AI policy classification for auto, approval-required, and denied commands.
- Redaction for secrets, tokens, raw private media paths, and unnecessary UI state.
- Cost/rate budget and model/provider abstraction contracts.
- Prompt-injection and tool-permission tests for node descriptions and external inputs.
- Audit records for prompt hash, snapshot revision, commands, validation, policy, approval, execution, observation, and
  rollback.
- FF-19 evidence, handoff, and status updates after validation.

Allowed lanes:

- `packages/ai-core/**`
- `packages/node-core/**`
- `docs/harness/AI-OPERATOR.md`
- `.harness/status/**`
- `.harness/handoffs/**`
- `.harness/evidence/FF-19/**`

Forbidden lanes:

- `apps/manager/**`
- `apps/client/**`
- `apps/display/**`
- provider integration outside the active contract
- persistence engines
- production deployment files

## Non-Goals

- Do not start FF-20.
- Do not bypass FF-18 semantic command-bus semantics.
- Do not add unapproved external provider calls or persistence.
- Do not weaken policy, redaction, audit, rollback, or security checks to pass tests.
- Do not claim runtime security proof from deterministic tests alone.

## Verification Expectations

Run task-specific AI safety/redaction/audit tests plus:

```bash
python3 .harness/scripts/validate_acceptance_contracts.py
corepack pnpm@8.15.9 verify
git diff --check
```

If `pnpm verify` fails only at the known hotspot baseline
`apps/server/src/assets/assets.service.ts: 498 lines exceeds ratchet max 492`, record the exact fingerprint and do not
weaken hotspot ratchets.

## FF-18 Final Report

Final state: complete with exact baseline validation fingerprint.

Proof matrix:

- AI semantic context, command bus, policy/validation/audit/history/rollback/redaction, command surfaces, UI mutation
  exclusion, GS-14 repair, prompt-injection handling, and redaction: deterministic proof recorded in
  `.harness/evidence/FF-18/summary.md` and `.harness/evidence/FF-18/acceptance-reconciliation.md`.
- GS-12: runtime/browser proof recorded in `.harness/evidence/FF-18/runtime-browser-investigation.md`; explicit DEV e2e
  proof lane reaches client NodeExecutor and records a real `flashlight` command, while production camera-denied
  runtime still rejects flashlight without timeout.
- Runtime override set/clear: deterministic semantic command-bus proof records validation, audit, history,
  `runtimeStatus.runtimeOverrides`, and rollback metadata.
- GS-13: browser/runtime proof recorded in `.harness/evidence/FF-18/runtime-browser-investigation.md`; live Display
  runtime receives `screenColor mode="modulate"` and renders changing color/opacity samples over time.

Fresh validation:

- `python3 .harness/scripts/validate_acceptance_contracts.py`: PASS
- `git diff --check`: PASS
- `corepack pnpm@8.15.9 exec tsx --test apps/display/src/lib/stores/display-screen-overlay.spec.ts`: PASS, 4 tests
- `corepack pnpm@8.15.9 --filter @shugu/display run lint`: PASS
- `corepack pnpm@8.15.9 --filter @shugu/display run build`: PASS with existing SvelteKit/Svelte export warnings
- `corepack pnpm@8.15.9 verify`: FAIL only at exact known out-of-scope hotspot baseline
  `apps/server/src/assets/assets.service.ts: 498 lines exceeds ratchet max 492`; all prior guard/lint/build/test/e2e
  and harness structure steps pass.

FF-19 may start. FF-20 must not start.

---

## Archived FF-18 Notes

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

The next `/goal` dispatch may continue FF-18 under the adaptive execution lane in
`.harness/goals/FF-18-review-contract.md`.

Allowed continuation is limited to the current FF-18 work package:

- classify the remaining GS-12 runtime blocker;
- update FF-18 contract/evidence/status/handoff files as part of the same work package;
- use TDD inside the approved client e2e/runtime proof lane only;
- prove that live Manager/Client/Server deployment reaches the client NodeExecutor command path;
- prove production camera, flashlight, motion, microphone, permission, and capability gates remain intact;
- commit code and evidence together after validation.

Codex must still stop before starting FF-19, weakening security/policy/audit/rollback/redaction/hotspot gates,
weakening production permission/capability checks, expanding beyond the approved lane, or substituting fixtures for
browser/runtime proof.

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

FF-18 is still incomplete. Do not start FF-19. The current GS-12 blocker has been resolved within the approved adaptive
client e2e/runtime proof lane: live Manager/Client/Server deploy reaches the client NodeExecutor command path, a
camera-denied runtime reports "Deploy failed: missing required capabilities: flashlight" without timing out, and an
explicit DEV e2e proof flag records a real `flashlight` command in the client e2e command log. Production camera and
flashlight permission gates remain intact by deterministic test.

Remaining blockers are not GS-12 deploy/capability blockers:

- GS-13 is still only partial because the bounded Manager Published Display `screenColor` chain is proven, but the full
  breathing-like AI scenario and AI observation loop are not product-proven.

Do not mark FF-18 complete and do not start FF-19 until those remaining blockers are resolved or formally accepted by
contract.

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

Fresh validation after the 2026-05-09 GS-12 capability/runtime proof:

- `corepack pnpm@8.15.9 exec tsx --test apps/manager/src/lib/components/nodes/node-canvas/controllers/loop-helpers.spec.ts`: PASS, 5 tests, 0 failures
- `corepack pnpm@8.15.9 exec tsx --test apps/client/src/lib/stores/client/client-runtime.spec.ts`: PASS, 2 tests, 0 failures
- `wc -l apps/client/src/lib/stores/client/client-runtime.ts apps/client/src/lib/stores/client/client-runtime-capabilities.ts`: PASS, `client-runtime.ts` is 413 lines after pure capability-helper extraction, below the hotspot ratchet
- Runtime/browser negative proof: PASS, camera-denied client rejects deploy with
  `Deploy failed: missing required capabilities: flashlight` and no `Deploy timeout`
- Runtime/browser positive proof: PASS, explicit DEV e2e proof flag deploys the GS-12 loop and records a `flashlight`
  command in the client e2e command log

Fresh validation after the 2026-05-09 runtime override semantic surface update:

- `corepack pnpm@8.15.9 --filter @shugu/node-core run build`: PASS
- `node --test packages/node-core/test/semantic-command-bus.test.mjs`: PASS, 9 tests, 0 failures
- `corepack pnpm@8.15.9 --filter @shugu/ai-core run build`: PASS
- `node --test packages/ai-core/test/remaining-command-surfaces.test.mjs`: PASS, 1 test, 0 failures
- `python3 .harness/scripts/check_hotspots.py`: FAIL only at the known out-of-scope baseline
  `apps/server/src/assets/assets.service.ts: 498 lines exceeds ratchet max 492`; no new hotspot failure remains
- `corepack pnpm@8.15.9 verify`: FAIL only at the same known out-of-scope hotspot after dependency guards, lint,
  build, node-core tests, FF-08 tests, FF-09 tests, node spec validation, offline node-executor e2e, and FF-08 Manager
  boundary guard pass
- Runtime override set/clear is now a deterministic semantic command surface with validation, audit, history,
  `runtimeStatus.runtimeOverrides`, and rollback metadata. This does not claim browser/live Manager runtime delivery
  proof.

## GS-13 Display Modulate Stop Update

2026-05-09 runtime/source reconciliation confirms the remaining FF-18 blocker is now GS-13 Display breathing-like
product proof:

- `proc-screen-color` emits a valid `screenColor` payload with `mode="modulate"`, `secondaryColor`, `minOpacity`,
  `maxOpacity`, `frequencyHz`, and `waveform`.
- Client `ScreenController` already implements modulate/pulse/cycle animation with `requestAnimationFrame`, color
  mixing, waveform evaluation, and opacity modulation.
- Display `setScreenColor` only reads `color` and `opacity`.
- Display route renders a static full-screen overlay with fixed background and opacity.

Therefore the bounded Manager Published Display solid-color proof remains valid but insufficient for full GS-13. Full
breathing-like Display output and AI observation cannot be product-proven without implementing Display-side modulation
support.

This is a stop condition under `.harness/goals/FF-18-review-contract.md` because `apps/display/**` is forbidden. Do not
modify Display code, mark FF-18 complete, or start FF-19 until the contract is revised with a bounded GS-13 Display
runtime proof lane or a valid dated risk acceptance is approved.

## GS-13 Display Modulate Runtime Proof Update

The FF-18 contract was revised in `34d2f03` to allow a narrow GS-13 Display runtime proof lane. Within that lane,
Display `screenColor mode="modulate"` is now implemented and browser/runtime-proven:

- `apps/display/src/lib/stores/display-screen-overlay.ts` owns the small pure overlay sampling helper.
- `apps/display/src/lib/stores/display-screen-overlay.spec.ts` proves solid, modulate, monotonic clock compatibility,
  and clear behavior with TDD.
- `apps/display/src/lib/stores/display.ts` delegates `setScreenColor` to the helper.
- `apps/display/src/routes/+page.svelte` samples the active overlay during `requestAnimationFrame`.
- `apps/display/src/lib/stores/display-stop-all.ts` clears overlay state with no active effect.

Runtime/browser proof:

- Playwright opened `https://localhost:5175/display/?server=https%3A%2F%2Flocalhost%3A3001`.
- A protocol-helper generated Manager socket sent `node-executor/reclaim` and `screenColor mode="modulate"` to
  target group `display`.
- Browser samples observed 5 unique `.screen-overlay` styles over time, including changing RGB values and opacity.
- Screenshot saved at `.harness/evidence/FF-18/gs13-display-modulate-browser-proof.png`.

Focused validation:

- `corepack pnpm@8.15.9 exec tsx --test apps/display/src/lib/stores/display-screen-overlay.spec.ts`: PASS, 4 tests
- `corepack pnpm@8.15.9 --filter @shugu/display run lint`: PASS
- `corepack pnpm@8.15.9 --filter @shugu/display run build`: PASS with existing SvelteKit/Svelte export warnings
- `python3 .harness/scripts/check_hotspots.py`: FAIL only at known out-of-scope baseline
  `apps/server/src/assets/assets.service.ts: 498 lines exceeds ratchet max 492`
- `corepack pnpm@8.15.9 verify`: FAIL only at the same known out-of-scope hotspot fingerprint after dependency guards,
  lint, build, node-core tests, FF-08 tests, FF-09 tests, node spec validation, offline node-executor e2e, FF-08
  Manager boundary guard, and harness structure validation pass

FF-18 should still not be marked complete until the final proof-matrix audit confirms no remaining required criterion
is missing and `pnpm verify` failure exactly matches the approved baseline fingerprint.
