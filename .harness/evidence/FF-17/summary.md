# FF-17 Evidence

Implemented a shared plugin lifecycle host/registry in `packages/plugin-core`.

## Checks
- `pnpm --filter @shugu/plugin-core run build`
- `node --test packages/plugin-core/test/plugin-host.test.mjs`
- `git diff --check`
- `pnpm lint` (passed with pre-existing warnings outside this task)
- `pnpm build:all` (passed with pre-existing warnings outside this task)
- `pnpm verify` (failed at harness hotspot ratchet on pre-existing `apps/server/src/assets/assets.service.ts` line count)

## Notes
- Plugin host supports load/init/start/stop/configure/dispose/status, capability/version compatibility, resource budgets, command/event-only mutation, and rollback-on-failure.
- Failure isolation was exercised by a plugin that throws during `init`; the host disposed that plugin and kept the compatible plugin running.
- Core state is exposed read-only through the host context snapshot.
