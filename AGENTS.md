# Repository Guidelines

## Project Structure & Module Organization
- `apps/manager/` – SvelteKit control UI (ControlPanel, selection, scene switching).
- `apps/client/` – SvelteKit experience client (VisualCanvas, device sensors, audio capture).
- `packages/visual-plugins/` – Three.js visuals (box scene, mel spectrogram).
- `packages/audio-plugins/` – Audio feature extraction (mel spectrogram, split bands).
- `packages/sdk-client/`, `packages/sdk-manager/` – SDKs for control/data transport.
- `packages/protocol/` – Shared message/types; keep in sync when changing payloads.

## Build, Test, and Development Commands
- `pnpm dev:manager` / `pnpm dev:client` / `pnpm dev:server` – Run individual apps in dev mode.
- `pnpm dev:all` – Run all apps in parallel (fast feedback when changing protocol/SDK).
- `pnpm build:all` – Production builds for every workspace package.
- `pnpm lint` – Lints TS/Svelte across the monorepo.
- `pnpm format` – Runs Prettier on tracked sources.

## Coding Style & Naming Conventions
- TypeScript + Svelte; prefer explicit types on public APIs and payloads.
- Indentation: 2 spaces; keep lines < 120 chars when practical.
- Components: `PascalCase.svelte`; utilities/helpers: `camelCase.ts`.
- Favor small, pure functions inside `packages/*`; avoid side-effects in module scope.
- Run `pnpm format` before pushing; Prettier config is repo-wide.
- Remember to comment when adding new features.
- When creating a new file, write the purpose/role of the file at the top
- When making drastic changes to a feature, file, some obsolete features, file comments you need to rewrite

## Testing Guidelines
- Add focused unit tests alongside code (e.g., `*.spec.ts`) when introducing protocol or DSP changes.
- At minimum, run `pnpm lint`; add regression tests for sensor mapping, audio feature math, and protocol serialization when modified.
- Keep test data small and deterministic; mock browser APIs for motion/audio when needed.

## Commit & Pull Request Guidelines
- Commits: concise, imperative mood (e.g., "Add mel spectrogram canvas fallback"). Group related changes; avoid noise.
- PRs: include summary, key verification steps (commands run), affected areas (manager/client/sdk), and screenshots/GIFs for UI changes.
- Link issues/task IDs when available; call out breaking changes in protocol or SDK contracts explicitly.

## Security & Configuration Tips
- Do not commit secrets; keep credentials in `secrets/` or local env files outside VCS.
- When touching networking or permissions, verify both HTTPS and localhost flows (`serverUrl` handling in client startup).
- Mind user-gesture requirements on mobile (audio/vibration); initialize such features inside click/tap handlers.

## Classic Manager Topology Rollback
- When the task is to remove Root or "everyone can become manager" behavior, treat the target topology as
  `Manager -> Server -> Client/Display`.
- `Manager` is the only human control and authoring surface. `Client` and `Display` are runtime endpoints, not
  control-plane owners. `Server` routes, validates, and fans out commands, but does not introduce Root authority.
- Do not preserve `/manager/root` as a product route when executing this rollback. Remove or retire Root-facing UI,
  Root authoring stores, Root-only navigation, Root stop-all authority, and Root-specific docs/evidence claims.
- Remove client-as-controller transfer behavior from the active product path. Clients may report sensors, readiness,
  media/runtime state, and transfer-response remnants only while being deleted or migrated; they must not gain
  manager-like mutation authority.
- Preserve working client, display, media, sensor, local display bridge, and server transport behavior unless a change
  is required to remove Root/control-transfer coupling.
- Before editing any symbol for this rollback, run GitNexus impact analysis as required below. If impact is HIGH or
  CRITICAL, stop and report the blast radius before continuing.
- Use `.harness/goals/FF-classic-manager-rollback-contract.md` as the acceptance contract for this rollback. Do not
  claim completion until its validation and stop-condition requirements are satisfied.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **FluffyFoundation** (13753 symbols, 22979 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/FluffyFoundation/context` | Codebase overview, check index freshness |
| `gitnexus://repo/FluffyFoundation/clusters` | All functional areas |
| `gitnexus://repo/FluffyFoundation/processes` | All execution flows |
| `gitnexus://repo/FluffyFoundation/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
