<!--
Purpose: Track the active harness task for Looooper Plan/Work/Review sessions.
-->

# Current Task

FF-13 - Client-As-Controller Transfer Lifecycle

## Previous Acceptance

FF-12 was accepted and committed as `8dca9a4 Add group sovereignty control plane`.

## Current Boundary

Client-As-Controller Transfer Lifecycle scope from `docs/harness/PLAN.md`:

- Offer/accept/deny transfer with TTL, UI confirmation on target client, revoke, disconnect fallback, and owner-stack
  recovery.
- Client controller commands carry actor role and scoped capability.
- Human-visible status for pending, accepted, revoked, and control lost.
- Verification target includes transfer expiry if not accepted, disconnect returning ownership to the previous operator,
  and unauthorized client control rejection.

Allowed FF-13 implementation boundary for a future bounded Work dispatch:

- Offer/accept/deny transfer lifecycle with TTL and target-client UI confirmation
- Revoke, disconnect fallback, and owner-stack recovery
- Actor role and scoped capability on client controller commands
- Human-visible pending, accepted, revoked, and control-lost status
- Tests proving transfer expiry, disconnect ownership return, and unauthorized client control rejection
- `docs/harness/**` only for FF-13 policy/evidence/ADR references
- `.harness/status/current-phase.md`
- `.harness/status/current-task.md`
- `.harness/handoffs/**`
- `.harness/evidence/FF-13/**`

## Work Result

FF-12 has been accepted and committed. FF-13 is now active; this transition updates harness status only and does not
implement client transfer lifecycle, client controller commands, UI confirmation, or runtime behavior.

## Next Expected Action

The next Plan dispatch may start bounded FF-13 Work using the boundary above.
