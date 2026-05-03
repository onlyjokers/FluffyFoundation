<!--
Purpose: Track the active harness task for Looooper Plan/Work/Review sessions.
-->

# Current Task

FF-12 - Group Sovereignty And ControlPlane V2

## Previous Acceptance

FF-11 was accepted and committed as `4616ab8 Add graph validation history and rollback`.

## Current Boundary

Group Sovereignty And ControlPlane V2 scope from `docs/harness/PLAN.md`:

- Group owner, owner stack, transferable flag, public/internal surfaces, visible-but-not-editable policy, reclaim,
  release, archive, and restore.
- Root always has emergency authority.
- Manager, client, service, and AI operators have explicit capabilities and scope.
- Server enforces Group ownership for commands.
- Verification target includes illegal actor denial tests, Manager reclaim and Root stop-all scenario, and Group archive
  as default delete behavior.

Allowed FF-12 implementation boundary for a future bounded Work dispatch:

- Group owner, owner stack, transferable flag, public/internal surfaces, visible-but-not-editable policy, reclaim,
  release, archive, and restore
- Root emergency authority across Group ownership
- Explicit Manager/client/service/AI operator capabilities and scope
- Server-side Group ownership enforcement for commands
- Tests proving illegal actor denial, Manager reclaim, Root stop-all, and Group archive as default delete behavior
- `docs/harness/**` only for FF-12 policy/evidence/ADR references
- `.harness/status/current-phase.md`
- `.harness/status/current-task.md`
- `.harness/handoffs/**`
- `.harness/evidence/FF-12/**`

## Work Result

FF-11 has been accepted and committed. FF-12 is now active; this transition updates harness status only and does not
implement Group sovereignty, ControlPlane V2, server ownership enforcement, or runtime behavior.

## Next Expected Action

The next Plan dispatch may start bounded FF-12 Work using the boundary above.
