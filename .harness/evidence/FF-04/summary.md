<!--
Purpose: Record FF-04 manager/auth/CORS security baseline proof and residual risks.
-->

# FF-04 Evidence Summary

## Security Decisions

- Manager role is denied by default when `SHUGU_MANAGER_KEY` is absent.
- Manager role is granted only when the supplied Socket.IO auth `managerKey` matches `SHUGU_MANAGER_KEY`, or when `SHUGU_ALLOW_INSECURE_MANAGER=1` is used from a local address outside production.
- Production server boot fails closed unless all of these are true:
  - `SHUGU_MANAGER_KEY` is configured.
  - `SHUGU_ALLOW_INSECURE_MANAGER` is not enabled.
  - `SHUGU_CORS_ORIGINS` is a non-empty explicit origin list and is not `*`.
  - HTTPS certificates were found.
- Production HTTP fallback for manager control is blocked in server boot policy and in the manager connect UI.
- The legacy frontend password literal is removed. Password login is available only in Vite dev mode with `VITE_SHUGU_MANAGER_DEV_PASSWORD`.

## Denial Proof

- `TSX_TSCONFIG_PATH=apps/server/tsconfig.json pnpm tsx --test "apps/server/src/**/*.spec.ts"` passed 14 tests.
- Covered missing manager key denial, wrong manager key denial, explicit local insecure allow, production insecure boot rejection, production wildcard CORS rejection, and production HTTP fallback rejection.
- `pnpm tsx --test apps/manager/src/lib/stores/auth.spec.ts` passed 2 tests proving the legacy hardcoded password is absent and dev password login is gated through Vite dev config.

## Build And Verification Proof

- `pnpm build:all` passed.
- `pnpm verify` passed.
- Existing warnings remain in lint/build/validation output:
  - `packages/sdk-client/src/tone-adapter/types.ts` has two existing `no-explicit-any` warnings.
  - Svelte/Vite build emits existing a11y, unused selector/prop, Sass deprecation, SvelteKit export, and chunk-size warnings.
  - `validate-node-specs` emits existing runtime-ignored warnings.
  - `harness:hotspots` emits existing watch-growth warnings but passed the ratchet.

## Accepted Residual Risks

- Production manager UI login is intentionally not a complete replacement auth system in FF-04; real production operator auth remains a later design item.
- Local/dev mode may still use wildcard CORS and explicit insecure manager mode for development, but production-like config is test-blocked.
- Browser/runtime proof was not run because FF-04 changed login/connect gating and server policy, and the Runtime Input allowed CLI/test proof for this boundary.
