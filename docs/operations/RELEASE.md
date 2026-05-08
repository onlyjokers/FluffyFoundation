<!--
Purpose: FF-23 release, provenance, rollback, and incident gates for production operations.
-->

# Release Operations

## Provenance

Every release candidate records:

- commit: the Git commit SHA used for the candidate.
- pnpm-lock.yaml: dependency lockfile hash from the same commit.
- evidence: harness evidence paths for FF-21, FF-22, FF-23, and later release checks.
- artifact source: build outputs must come from `pnpm verify` inputs, not from local untracked files.

## Release Candidate Checklist

| Gate | Passed | Failed | Deferred | Release-blocking | Evidence |
| --- | --- | --- | --- | --- | --- |
| Dependency review | yes | no | no | no | `pnpm audit --audit-level high` |
| Secret scan | yes | no | no | no | `node scripts/security/scan-secrets.mjs $(git ls-files)` |
| CodeQL-equivalent static gates | yes | no | no | no | `.github/workflows/ci.yml` security job |
| Production config validation | yes | no | no | no | `node scripts/ff23/validate-production-config.mjs` |
| Backup/restore drill | yes | no | no | no | `node scripts/ff23/backup-restore-drill.mjs` |
| Rollback and Incident procedure | yes | no | no | no | this document |

Deferred release proof is rejected by default. Any high, blocking, or release-blocking accepted issue stops the
release.

## Rollback

Rollback owner: release operator on call.

Rollback procedure:

1. Stop the current release candidate.
2. Restore the prior commit and matching `pnpm-lock.yaml`.
3. Restore project, asset, and state backups from the latest verified backup bundle.
4. Run the smoke gates listed in the Release Candidate Checklist.
5. Record the rollback token, owner, date, reason, and revisit condition in the incident log.

## Incident

Incident records must include:

- owner
- date
- affected commit
- severity
- user impact
- rollback decision
- revisit condition

Security, audit, rollback, or policy weakening is not an incident workaround. It is a release-blocking stop condition.
