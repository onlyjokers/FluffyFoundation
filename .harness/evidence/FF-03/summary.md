<!--
Purpose: Evidence summary for FF-03 runtime protocol schema and compatibility validation.
-->

# FF-03 Evidence - Runtime Protocol Schema And Compatibility

## Scope

- Added dependency-free runtime validation under `packages/protocol/src/validation*`.
- `isValidMessage()` now delegates to schema-backed `validateMessage()`.
- Server socket ingress logs structured schema/policy rejection metadata before routing.
- No dependency or lockfile changes were required.

## Compatibility Fixtures

Valid current-version fixtures cover:

- `ControlMessage`
- `SensorDataMessage`
- `MediaMetaMessage`
- `PluginControlMessage`
- `SystemMessage`

Negative fixtures cover:

- unsupported protocol version
- unknown message type
- malformed control target/payload
- malformed concrete sensor payloads for `gyro`, `accel`, `orientation`, and `mic`
- malformed media `executeAt`
- unsupported plugin command
- malformed system client list item
- server ingress authorization rejection

Example structured rejection:

```json
{
  "actor": "manager",
  "scope": "message.control.payload",
  "type": "control",
  "path": "payload",
  "decision": "reject",
  "code": "protocol.field.required",
  "message": "payload is required"
}
```

## TDD Evidence

- RED protocol test: `pnpm --filter @shugu/protocol exec tsc --outDir /tmp/ff03-protocol-red --noEmit false && node --test /tmp/ff03-protocol-red/validation.spec.js`
  - Failed before implementation because `validateMessage` was not exported.
- RED server ingress test: `pnpm --filter @shugu/server exec tsx --test src/events/events.gateway.spec.ts`
  - Failed before implementation because shallow validation routed schema-invalid control messages and unauthorized rejects used legacy log text.
- GREEN focused protocol test: `pnpm --filter @shugu/protocol exec tsc --outDir /tmp/ff03-protocol-check --noEmit false && node --test /tmp/ff03-protocol-check/*.spec.js`
  - PASS: 9 tests, 0 failures.
- GREEN focused server test: `pnpm --filter @shugu/server exec tsx --test src/events/events.gateway.spec.ts`
  - PASS: 2 tests, 0 failures.

## Verification

- `pnpm --filter @shugu/protocol run lint`
  - PASS.
- `pnpm --filter @shugu/server run lint`
  - PASS.
- `pnpm build:all`
  - PASS.
  - Existing Svelte/Vite warnings remain in manager/client/display builds.
- `pnpm verify`
  - PASS.
  - Existing warnings: sdk-client `any` lint warnings, Svelte/Vite build warnings, node-spec warnings, hotspot watch warnings.
- `pnpm harness:hotspots`
  - PASS: hotspot ratchet satisfied.
- `git diff --check`
  - PASS.
- `git status --short --branch`
  - Captured after implementation for Review scope check.
