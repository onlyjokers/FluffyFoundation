<!--
Purpose: Track the active harness task for Looooper Plan/Work/Review sessions.
-->

# Current Task

FF-02 - Topology Ownership And No-God-Object Ratchets

## Current Boundary

Ownership and topology ratchet scope:

- `.harness/hotspots-allowlist.json`
- `.harness/scripts/**` for hotspot/dependency guard support
- `scripts/**` for dependency/boundary guard support
- `package.json` only for verification script wiring if required
- `CODEOWNERS` or `.github/CODEOWNERS` if the repo convention requires it
- `docs/harness/**` only for FF-02 policy/evidence references
- `.harness/status/current-phase.md`
- `.harness/status/current-task.md`
- `.harness/handoffs/**`
- source fixture files only when needed for executable negative dependency/import proofs

## Next Expected Action

Review the FF-02 ownership/topology ratchets, evidence, and handoff. If accepted, Review owns the final commit.
