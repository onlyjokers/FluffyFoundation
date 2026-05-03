<!--
Purpose: Handoff the FF-12 acceptance and FF-13 harness status transition to Review.
-->

# FF-12 To FF-13 Status Transition Handoff

## Decision

PASS candidate for Review.

## Previous Acceptance

FF-12 - Group Sovereignty And ControlPlane V2 was accepted and committed as
`8dca9a4 Add group sovereignty control plane`.

## Active Phase And Task

FF-13 - Client-As-Controller Transfer Lifecycle is now the active harness phase and task.

## FF-13 Boundary

FF-13 must let authorized clients temporarily control Groups without bypassing safety.

Planned scope from `docs/harness/PLAN.md`:

- Offer/accept/deny transfer with TTL, UI confirmation on target client, revoke, disconnect fallback, and owner-stack
  recovery.
- Client controller commands carry actor role and scoped capability.
- Human-visible status for pending, accepted, revoked, and control lost.

Verification target:

- Transfer expires if not accepted.
- Disconnect returns ownership to the previous operator.
- Unauthorized client control is rejected.

## Scope Notes

- This boundary only updates harness status and handoff state.
- It does not implement FF-13.
- It does not modify transfer, client, server, ControlPlane, Semantic Canvas, CLI/API parity, or AI runtime behavior.
- Ignored `.harness/evidence/FF-12/**`, `.looooper/runs/**`, caches, logs, and build outputs remain disposable local state.
- Residual unstaged `.looooper/workflow.yaml` remains untouched and outside this boundary.
