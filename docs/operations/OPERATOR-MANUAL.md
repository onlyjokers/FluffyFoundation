<!--
Purpose: FF-24 operator manual for running ShuGu/FluffyFoundation rehearsals and show-mode recovery.
-->

# Operator Manual

## Root

Root owns emergency authority. Use Root for publish/reclaim decisions, stop-all recovery, and final show-mode shutdown.
Root operations must preserve scope ownership and must not bypass policy, audit, rollback, or redaction gates.

## Manager

Manager is the primary control surface for graph editing, group publishing, client targeting, display control, and
runtime overrides. Before a rehearsal, open the Manager workspace, confirm the intended Group is selected, confirm
published Groups are visible, and run only commands that match the active rehearsal scope.

## Client

Client devices provide sensors, audio, media, and executable node runtimes. Before show mode, verify the client joins the
expected Group, reports capabilities, and rejects unavailable capabilities instead of timing out. Permission-dependent
features such as flashlight or sensors must be proven through the approved runtime path, not by deterministic fixtures.

## Display

Display devices render visual output and show-mode feedback. Before launch, verify the Display joins the expected
surface, receives protocol-helper generated control messages, and shows visible output changes during modulation.

## AI Operator

AI Operator may inspect allowed semantic context, propose graph edits, and request dry-run validation. It must not read
secrets, mutate Canvas state directly, bypass command-bus policy, or approve its own proposals.

## Rehearsal

A rehearsal records the release candidate commit, commands run, browser/runtime evidence, observed failures, and recovery
notes. A rehearsal is valid only when the evidence is tied to real runtime or browser checks and the report names the
recovery action taken or confirms that no recovery was needed.

## Show Mode

Show mode starts only after Manager, Client, Display, and Root checks pass. During show mode, prefer scoped Group actions
over global actions. Root stop-all remains the final emergency path.

## Recovery

Use the smallest recovery action that restores safe operation:

1. Stop the affected loop or Group.
2. Reclaim or republish the Group if ownership drifted.
3. Restart the affected Client or Display runtime.
4. Roll back to the prior release commit and matching `pnpm-lock.yaml` if release validation regresses.

## Troubleshooting

- Manager cannot control a Group: confirm ownership, scopeGroupId, and Root reclaim policy.
- Client rejects an action: check capability proof and permission state before changing runtime code.
- Display does not update: confirm protocol-helper generated messages and display connection status.
- AI proposal cannot apply: inspect structured validation errors and repair options.
- Release gate fails: keep the failure blocking unless it has a dated accepted-risk record allowed by the severity policy.
