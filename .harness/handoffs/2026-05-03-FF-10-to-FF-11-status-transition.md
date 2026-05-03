<!--
Purpose: Record the harness-only transition from accepted FF-10 work to the next FF-11 boundary.
-->

# FF-10 To FF-11 Status Transition

## Accepted Boundary

FF-10 - Node Registry V2 And Agent-Readable Node Definitions was accepted and committed as
`19f6b2b Add node registry v2 metadata`.

This transition does not modify FF-10 implementation artifacts and leaves the residual unstaged
`.looooper/workflow.yaml` outside this boundary.

## Active Boundary

FF-11 - Graph Validation, Migrations, History, And Rollback is now the active phase/task.

Next bounded Work should follow the `docs/harness/PLAN.md` FF-11 scope:

- Validator checks endpoint existence, port compatibility, param bounds, Group boundaries, execution platform,
  side effects, cycles, disabled nodes, and deployability.
- Versioned graph/project schema with migrations and fixtures.
- Semantic history captures meaningful changes but excludes layout-only noise.
- Rollback restores previous semantic revision and stops/redeploys partitions safely.

## Verification Target

Future FF-11 proof should include:

- Old fixtures migrate to the current graph/project schema.
- Bad connections and param overflow fail with structured errors.
- Rollback restores previous output behavior after semantic graph changes.

## Non-Goals For This Transition

- Do not implement FF-11.
- Do not modify graph validation, runtime, CLI, API, or Semantic Canvas code.
- Do not edit `.looooper/workflow.yaml`.
- Do not stage or commit; Review owns final accept-and-commit.
