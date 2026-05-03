<!--
Purpose: Track the active harness task for Looooper Plan/Work/Review sessions.
-->

# Current Task

FF-16 - Asset, Media, Audio, And Visual Pipeline Hardening

## Previous Acceptance

FF-15 was accepted and committed as `94dc057`.

## Current Boundary

Asset, Media, Audio, And Visual Pipeline Hardening scope from `docs/harness/PLAN.md`:

- Asset manifest with IDs, checksums, MIME, kind, duration/dimensions, variants, cache policy, and permissions.
- Preload/readiness model for client/display with timeout and retry.
- Unified media/audio/visual node side effects and cleanup.
- Local-media references are portable or clearly marked local-only.
- Verification targets are upload/preload/play scenarios for image, video, and audio; missing asset actionable error;
  and stop-all clearing media, sound, color, visual scenes, and node executors.

Allowed FF-16 implementation boundary for a future bounded Work dispatch:

- Asset manifest fields for IDs, checksums, MIME, kind, duration/dimensions, variants, cache policy, and permissions
- Client/display preload and readiness behavior with timeout and retry
- Unified cleanup for media/audio/visual node side effects
- Portable local-media references, or explicit local-only marking when portability is not possible
- Tests proving upload/preload/play for image, video, and audio; actionable missing asset errors; and stop-all clearing
  media, sound, color, visual scenes, and node executors
- `docs/harness/**` only for FF-16 policy/evidence/ADR references
- `.harness/status/current-phase.md`
- `.harness/status/current-task.md`
- `.harness/handoffs/**`
- `.harness/evidence/FF-16/**`

## Work Result

FF-15 has been accepted and committed as `94dc057`. FF-16 is now active; this transition updates harness status only
and does not implement asset manifest behavior, preload/readiness behavior, media/audio/visual side-effect cleanup,
local-media portability behavior, upload/preload/play behavior, missing asset errors, or stop-all cleanup behavior.

## Next Expected Action

The next Plan dispatch may start bounded FF-16 Work using the boundary above.
