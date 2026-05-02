<!--
Purpose: Entry point for the FluffyFoundation completion harness and the rules agents must follow before changing product code.
-->

# FluffyFoundation Harness

This harness is the operating system for taking FluffyFoundation from its current engineering-recovery state to a real performance-ready product. It is intentionally stricter than the older project plans because the current risks are not missing features; they are unsafe authority boundaries, shallow protocol validation, semantic drift between GUI/runtime/API, display transport ambiguity, large hotspot files, and weak verification.

## Source Of Truth

- Product and architecture direction: [PLAN.md](PLAN.md)
- Hard architectural boundaries: [BOUNDARIES.md](BOUNDARIES.md)
- AI semantic operator contract: [AI-OPERATOR.md](AI-OPERATOR.md)
- Required gates and review evidence: [QUALITY-GATES.md](QUALITY-GATES.md)
- End-to-end acceptance scenarios: [GOLDEN-SCENARIOS.md](GOLDEN-SCENARIOS.md)
- Verification commands and artifact rules: [VERIFY.md](VERIFY.md)
- External reference set: [REFERENCES.md](REFERENCES.md)

Runtime workflow state lives under `.harness/status/`. Looooper orchestration lives under `.looooper/`.

## Non-Negotiable Invariants

1. No new major feature ships before the P0 risks in `FF-00` through `FF-07` are closed or explicitly accepted in a phase review.
2. Canvas UI is only a visualization/editing surface. Any semantic operation that changes output must go through the same command/API path used by CLI and AI.
3. AI is a creative Operator, not a chatbot bolted onto the UI. It must operate on semantic graph state, node registry metadata, validation results, permissions, runtime status, and rollbackable commands.
4. Node definitions must be registry-driven. Adding a node type must make it visible to human UI, CLI/API, validation, and AI without editing a global behavior switch.
5. Every mutating command must validate before apply, emit audit/history after apply, and provide a rollback or recovery path.
6. Every phase exit requires evidence: commands run, scenario proof, known risks, rollback notes, and reviewer verification.
7. Large hotspot files are frozen by ratchet. They may shrink freely; they may grow only inside an approved split/retirement task.

## Completion Definition

This plan is complete only when the system can be used for real rehearsals and controlled live performance:

- Root can author and publish semantic Groups.
- Manager can perform against published Groups without loading the heavy editor.
- Client and Display execute authorized partitions with visible status, recovery, and kill-switch behavior.
- AI can inspect a semantic graph and safely produce executable graph operations through the same command bus as humans.
- Golden scenarios pass repeatedly on local and CI harnesses.
- Security, observability, release, and rollback gates are active rather than merely documented.
