<!--
Purpose: Completion plan for transforming FluffyFoundation into a production-ready interactive performance system.
-->

# FluffyFoundation Production Harness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Finish FluffyFoundation as a real, safe, extensible live-performance operating system where Root, Manager, Client, Display, Server, Node Graph, NodeExecutor, Display transport, plugins, and AI Operator are all governed by one semantic command model.

**Architecture:** The plan first stabilizes verification, security, protocol, Scope, runtime-state, and realtime semantics. It then moves semantic graph operations behind a command bus shared by Canvas, CLI/API, and AI, makes Node Registry the source of agent-readable behavior, and only then completes ControlPlane, distributed execution, Display, plugins, AI, observability, and launch readiness.

**Tech Stack:** pnpm workspace, SvelteKit, NestJS, Socket.IO, TypeScript, `@shugu/protocol`, `@shugu/node-core`, `@shugu/sdk-*`, Playwright, Node test runner, Python harness scripts, Looooper workflow.

Completing every item below means the project is ready for real operational use, not just local demos.

## Program Rules

1. Use the active `FF-*` item as the task ID in branch names, handoffs, PRs, and evidence.
2. Do not start a later feature item while an earlier P0 repair item has unresolved code or review feedback.
3. Every item must produce executable checks or an explicit, dated risk acceptance.
4. GUI-only semantic behavior is not accepted. Canvas, CLI/API, and AI must call the same command/API layer.
5. Any AI-visible mutation requires policy, validation, audit, rollback, and redaction review.
6. Any new package, external provider, persistence engine, or protocol-breaking change requires an ADR linked from evidence.
7. Every phase exit must update `.harness/status/current-phase.md`, `.harness/status/current-task.md`, and a handoff under `.harness/handoffs/`.

---

## FF-00 - Harness Cutover And Baseline Freeze

**Goal:** Install this harness as the active development system and freeze the current state.

**Deliverables:**
- `.harness/`, `.looooper/`, and `docs/harness/` are active.
- Existing historical plans remain as reference, but this file becomes the active completion plan.
- Baseline evidence records current git status, package list, scripts, known hotspots, current CI mismatch, and the external evaluation doc path.

**Verification:**
- `pnpm harness:verify`
- `git status --short --branch`
- Baseline handoff references `docs/PLAN_0109_MAJOR_GAPS_AND_SYSTEMIC_ISSUES.md` and `docs/PROJECT_STRUCTURE_AND_ARCHITECTURE_DEEP_DIVE.md`.

## FF-01 - Unified Verify, CI, And Evidence Artifacts

**Goal:** Make verification a real gate rather than a convention.

**Deliverables:**
- Root `pnpm verify` is the single local/CI command.
- CI runs `pnpm verify`, not `pnpm build`.
- `verify` includes dependency guards, lint, build, node-core tests, node spec validation, node-executor offline e2e, harness validation, hotspot ratchet, and any phase-specific checks.
- CI uploads logs/traces/screenshots where available.

**Verification:**
- GitHub Actions shows required status checks on the default branch.
- A deliberately broken boundary import and broken node spec fail locally.

## FF-02 - Topology Ownership And No-God-Object Ratchets

**Goal:** Stop architectural debt from growing while refactors proceed.

**Deliverables:**
- Hotspot allowlist freezes current large files with max-line ratchets.
- Boundary guard expands beyond protocol/node-core to Root, Manager, Display, SDK, server, plugin, AI, and persistence lanes.
- CODEOWNERS maps real owners for architecture, security, AI, server, UI, protocol, runtime, and release paths.
- New file/package policy requires purpose header and ADR for topology changes.

**Verification:**
- `pnpm harness:hotspots`
- `pnpm guard:deps`
- Invalid deep import fixture fails.

## FF-03 - Runtime Protocol Schema And Compatibility

**Goal:** Reject malformed messages before they enter routing or execution.

**Deliverables:**
- Runtime schemas for `ControlMessage`, `SensorDataMessage`, `MediaMetaMessage`, `PluginControlMessage`, and `SystemMessage`.
- Compatibility fixtures for current protocol version and migration/error paths.
- Structured reject reasons with actor, scope, message type, path, and policy decision.
- `isValidMessage` becomes a schema-backed validator, not a shallow type/version check.

**Verification:**
- Bad payloads fail in protocol/server tests.
- Server logs contain structured validation codes.

## FF-04 - Manager/Auth/CORS Security Baseline

**Goal:** Close the easiest control-plane takeover paths.

**Deliverables:**
- Manager role is denied by default unless a configured secure key or explicit local insecure flag is present.
- Production CORS is not `*`.
- Hardcoded frontend login secret is removed or isolated to explicit dev mode.
- HTTP fallback is documented and blocked for production manager control.

**Verification:**
- Missing manager key denial test.
- Production-like boot test proves insecure config fails closed.

## FF-05 - Scope, Audit, And Command Envelope Repair

**Goal:** Make `scopeGroupId` a trustworthy authorization and audit key.

**Deliverables:**
- SDK-manager preserves caller scope instead of forcing `SYSTEM_SCOPE_GROUP_ID`.
- Every non-system control command carries `scopeGroupId`, actor, role, correlation ID, and idempotency key.
- Server normalizes only allowed envelope fields and rejects ambiguous scope.
- Audit record contract is created for every mutating command.

**Verification:**
- Unit tests for batching/flush scope preservation.
- Server authorization tests for missing/wrong scope.

## FF-06 - Server State Strategy And Multi-Instance Contract

**Goal:** Remove the current “Redis broadcast but local truth” ambiguity.

**Deliverables:**
- ADR chooses either explicit single-server production mode or shared state for registry, selection, ownership, and control-plane snapshot.
- If single-server: boot/runtime checks make it visible and reject unsupported clustered configs.
- If shared-state: registry/control-plane updates publish/subscribe and converge across instances.
- Status UI and logs show the active state strategy.

**Verification:**
- Single-server guard or two-instance convergence test.
- Ownership snapshot cannot diverge silently.

## FF-07 - Realtime Delivery Contract, Backpressure, And Final-Value Semantics

**Goal:** Make realtime throttling predictable instead of two layers silently dropping state.

**Deliverables:**
- Explicit classes for volatile telemetry, latest-state controls, reliable commands, and scheduled commands.
- SDK/server throttling share one delivery contract.
- Latest-state keys are replayed or removed; no dead pending map.
- Metrics track dropped, coalesced, delivered, late, and rejected messages.

**Verification:**
- Deterministic tests for coalescing and last-value delivery.
- Load test records latency/drop budgets.

## FF-08 - Root/Manager Product Split

**Goal:** Root becomes the heavy authoring environment; Manager becomes a lightweight performance console.

**Deliverables:**
- `/root` owns graph authoring, Group publishing, permissions, recovery, and global stop.
- `/manager` consumes published Groups and does not load heavy Rete/NodeCanvas bundles by default.
- Shared stores are split into connection, client registry view, display status, group controls, and root authoring domains.
- Bundle and import guards prevent Manager from reabsorbing Root code.

**Verification:**
- Build/bundle evidence shows Manager path excludes NodeCanvas/Rete.
- Manager can perform existing control paths through published Group controls.

## FF-09 - Semantic Graph Object Model And Command Bus

**Goal:** Establish one semantic operation layer for Canvas, CLI/API, and AI.

**Deliverables:**
- `SemanticGraphSnapshot` excludes UI noise but includes nodes, definitions, ports, params, Group boundaries, connections, execution partitions, runtime status, device capabilities, errors, permissions, and current revision.
- Command bus supports add/remove/archive node, connect/disconnect, update params, create/update/archive Group, deploy/stop partition, and proposal workflow.
- Commands are transactional: dry-run validation, policy check, apply, audit, history, rollback token.
- Canvas adapters translate UI gestures into commands instead of mutating graph internals directly.

**Verification:**
- CLI fixture performs the same semantic operation as Canvas.
- UI-only semantic mutation guard fails on direct graph mutation.

## FF-10 - Node Registry V2 And Agent-Readable Node Definitions

**Goal:** Make every node type discoverable, validatable, migratable, and understandable by AI without hardcoded logic.

**Deliverables:**
- NodeDefinition includes version, category, platform targets, side-effect class, permission needs, port schemas, param schemas, units, ranges, defaults, compatibility rules, examples, risk notes, and AI-readable description.
- JSON specs and `@shugu/node-core` definitions converge behind one registry loader.
- New node fixture proves registration requires no global switch edit.
- Registry emits compact agent summaries for AI context.

**Verification:**
- `pnpm validate:node-specs`
- No-global-switch registry test.
- AI context snapshot includes newly added fixture node automatically.

## FF-11 - Graph Validation, Migrations, History, And Rollback

**Goal:** Make graph state safe to evolve and recover.

**Deliverables:**
- Validator checks endpoint existence, port compatibility, param bounds, Group boundaries, execution platform, side effects, cycles, disabled nodes, and deployability.
- Versioned graph/project schema with migrations and fixtures.
- Semantic history captures meaningful changes but excludes layout-only noise.
- Rollback restores previous semantic revision and stops/redeploys partitions safely.

**Verification:**
- Old fixtures migrate to current.
- Bad connections and param overflow fail with structured errors.
- Rollback scenario restores output behavior.

## FF-12 - Group Sovereignty And ControlPlane V2

**Goal:** Make Group ownership the central authorization unit.

**Deliverables:**
- Group owner, owner stack, transferable flag, public/internal surfaces, visible-but-not-editable policy, reclaim, release, archive, restore.
- Root always has emergency authority.
- Manager/client/service/AI operators have explicit capabilities and scope.
- Server enforces Group ownership for commands.

**Verification:**
- Illegal actor denial tests.
- Manager reclaim and Root stop-all scenario.
- Group archive is default delete behavior.

## FF-13 - Client-As-Controller Transfer Lifecycle

**Goal:** Let authorized clients temporarily control Groups without bypassing safety.

**Deliverables:**
- Offer/accept/deny transfer with TTL, UI confirmation on target client, revoke, disconnect fallback, and owner-stack recovery.
- Client controller commands carry actor role and scoped capability.
- Human-visible status for pending/accepted/revoked/control lost.

**Verification:**
- Transfer expires if not accepted.
- Disconnect returns ownership to previous operator.
- Unauthorized client control is rejected.

## FF-14 - Distributed NodeExecutor V2 And Execution Partitions

**Goal:** Move high-frequency behavior to the correct execution target with observable lifecycle.

**Deliverables:**
- Execution partitions define target platform: manager, client, display, server, worker, or local-only.
- Deploy/start/stop/remove/redeploy are command-bus operations with validation, capability checks, revision binding, and status.
- Client/display partitions can control allowed targets only through ControlPlane.
- Watchdog, resource budgets, and failure reports are structured.

**Verification:**
- Deploy bad capability is rejected.
- Stop/remove recovers manager-side fallback.
- Partition revision mismatch is detected.

## FF-15 - Display Transport Unification And Multi-Display Routing

**Goal:** Eliminate “looks connected but output did not change” states.

**Deliverables:**
- Local MessagePort and server fallback implement the same transport interface.
- Display status distinguishes discovered, paired, reachable, degraded, fallback, and failed.
- Multi-display routing supports groups, named displays, capabilities, local media limits, and server-deliverable assets.
- Display operations report ack/nack with reason.

**Verification:**
- Local bridge success scenario.
- Forced local bridge failure falls back through server and visibly updates output.
- Multi-display routing fixture sends different outputs to two displays.

## FF-16 - Asset, Media, Audio, And Visual Pipeline Hardening

**Goal:** Make performance media reliable under rehearsal and show conditions.

**Deliverables:**
- Asset manifest with IDs, checksums, MIME, kind, duration/dimensions, variants, cache policy, and permissions.
- Preload/readiness model for client/display with timeout and retry.
- Unified media/audio/visual node side effects and cleanup.
- Local-media references are portable or clearly marked local-only.

**Verification:**
- Upload/preload/play scenario for image, video, audio.
- Missing asset produces actionable error.
- Stop-all clears media, sound, color, visual scenes, and node executors.

## FF-17 - Plugin Host And Capability Lifecycle

**Goal:** Stop Tone, multimedia, visual, AI, and future integrations from each inventing lifecycle rules.

**Deliverables:**
- Plugin contract for load, init, start, stop, configure, dispose, status, capabilities, errors, resource budgets, and side effects.
- Registry-driven plugin discovery and version compatibility.
- No plugin may mutate core state outside commands/events.
- Plugin failure isolation prevents one plugin from breaking the show loop.

**Verification:**
- Plugin lifecycle tests.
- Failure fixture proves dispose/rollback.

## FF-18 - AI Operator Semantic Runtime

**Goal:** Give AI the same semantic operation power as a human Manager/Root within policy.

**Deliverables:**
- AI intent pipeline: semantic snapshot pack, registry summary, permission context, validation reports, planner, proposal, dry-run, execute, observe, repair loop.
- AI can add nodes, remove/archive nodes, connect/disconnect, modify params, insert mapping/normalize nodes, adjust Group internals, deploy/stop partitions, and produce human approval proposals.
- AI never consumes canvas layout noise as primary context.
- AI reports exact command sequence, expected output change, risk, rollback, and observed result.

**Verification:**
- Natural-language scenario: gyro rotation drives tense flashlight rhythm.
- Natural-language scenario: display visual becomes breathing-like.
- AI repair scenario fixes param overflow or incompatible connection using validation errors.

## FF-19 - AI Safety, Policy, Cost, Redaction, And Audit

**Goal:** Keep creative AI powerful without making it an unbounded mutation engine.

**Deliverables:**
- Policy engine classifies commands as auto, approval-required, or denied.
- Redaction layer strips secrets, tokens, raw private media paths, and unnecessary UI state.
- AI cost/rate budgets and model/provider abstraction.
- Prompt-injection and tool-permission tests for node descriptions and external inputs.
- Audit trail records AI prompt hash, snapshot revision, commands, validation, policy, approval, execution, observation, rollback.

**Verification:**
- AI cannot execute destructive/high-risk command without approval.
- Redaction fixture proves secrets are not present in model context.

## FF-20 - Observability, Reporting, And Operator Console

**Goal:** Make failures visible, structured, and actionable during a show.

**Deliverables:**
- Structured events for validation errors, permission denials, transport failures, node executor status, display status, asset readiness, AI proposals, and rollback.
- Metrics for latency, traffic, errors, saturation, drops, FPS, audio readiness, device capability, and command outcomes.
- Operator console shows health, active partitions, connected devices, failed commands, pending transfers, and kill-switch state.

**Verification:**
- Scenario artifacts include logs/metrics/trace excerpts.
- Reviewer can diagnose a failed display update from structured reports.

## FF-21 - Executable Golden Scenarios

**Goal:** Convert product readiness into tests, not prose.

**Deliverables:**
- Golden scenarios in this harness become Playwright, CLI, contract, trace-replay, or load-test fixtures.
- Scenarios cover Manager->Client, Root publish, Display fallback, asset preload, NodeExecutor deploy, ControlPlane transfer/reclaim, AI graph edit, rollback, and show stop.
- CI labels slow scenarios and release scenarios separately.

**Verification:**
- `pnpm test:golden` or equivalent phase command.
- Each scenario stores evidence artifacts.

## FF-22 - Performance Budgets, Load, And Show Mode Resilience

**Goal:** Prove the system holds under realistic device counts and failure conditions.

**Deliverables:**
- Budgets for latency, drop rate, CPU, memory, FPS, startup time, deploy time, and recovery time.
- Load harness for many clients and displays.
- Rehearsal mode and show mode configuration.
- Kill-switch and safe-mode drills: stop media, clear screens, stop executors, revoke rogue controllers, reconnect.

**Verification:**
- Load test report with accepted thresholds.
- Drill evidence for network interruption, display refresh, client reconnect, and Root stop-all.

## FF-23 - Security, Supply Chain, Release, And Operations

**Goal:** Make production deployment repeatable and defensible.

**Deliverables:**
- Security workflows for dependency review, secret scanning, CodeQL or equivalent, and provenance notes.
- Production config validation and deployment checklist.
- Backup/restore strategy for projects/assets/state.
- Release train with version, migration, rollback, and incident procedure.

**Verification:**
- Release candidate checklist completed.
- Security scans pass or have accepted issues.

## FF-24 - Dogfood, Documentation, And Production Launch Readiness

**Goal:** Exit only after real rehearsal workflows pass repeatedly.

**Deliverables:**
- Operator manual for Root, Manager, Client, Display, AI Operator, rehearsal, show mode, recovery, and troubleshooting.
- Developer guide for adding nodes/plugins/connectors with registry, validation, tests, and AI descriptions.
- Dogfood rehearsal logs across multiple sessions.
- Final launch review closes all critical risks.

**Verification:**
- Full golden suite passes on a release candidate.
- At least two rehearsal/dogfood reports show stable operation and documented recovery.
- Final phase review states production readiness or lists explicit blockers.
