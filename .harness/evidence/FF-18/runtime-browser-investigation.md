<!--
Purpose: Record real runtime/browser investigation evidence for FF-18 acceptance reconciliation.
-->

# FF-18 Runtime Browser Investigation

Date: 2026-05-07

## Result

FF-18 runtime/browser/product proof is still blocked, but the earlier Manager Socket.IO certificate blocker is no
longer current. The local Manager app is reachable, chrome-devtools MCP and browser-use MCP are available, the server
health endpoint is reachable from a browser, Manager login succeeds, Manager establishes Socket.IO polling to the
server, and the Root Node Graph view renders.

This evidence does not mark FF-18 complete and does not start FF-19.

## 2026-05-08 Earlier Update

```text
lsof -nP -iTCP:3001 -sTCP:LISTEN
PASS: node listens on TCP *:3001

lsof -nP -iTCP:5173 -sTCP:LISTEN
PASS: node listens on TCP *:5173

curl -k -I https://localhost:3001/health
PASS: HTTP/1.1 200 OK

curl -k -I https://localhost:5173/manager/
PASS: HTTP/2 200
```

```text
browser-use browser_navigate https://localhost:5173/manager/
PASS: opened the Manager URL in a browser tab.

browser-use browser_screenshot
PASS: Chrome reported NET::ERR_CERT_AUTHORITY_INVALID for localhost.

browser-use browser_click Advanced / continue to localhost
PASS: reached the Fluffy Manager login screen.

chrome-devtools fill_form
PASS: filled local dev username/password; password value was masked in the snapshot.

chrome-devtools click Login
PASS: reached the Manager connect panel showing Server URL https://localhost:3001 and logged-in user Eureka.

chrome-devtools click Connect
FAIL: page shows "Failed to connect. Please check the server URL."

chrome-devtools list_network_requests
FAIL: Socket.IO polling to https://localhost:3001/socket.io/?role=manager... fails with NET::ERR_CERT_AUTHORITY_INVALID.

chrome-devtools list_console_messages
FAIL: repeated "[SDK Manager] Connection error: xhr poll error" with certificate authority failures.
```

Scope note:
- No manager key or password is recorded in this evidence.
- This earlier browser proof reached the authenticated connect screen, but did not prove workspace/canvas operation.
- This was runtime/browser proof of the blocker observed in that earlier check, not product proof for GS-12 or GS-13.

## 2026-05-08 Clean Recheck

```text
lsof -nP -iTCP:3001 -sTCP:LISTEN
PASS: node listens on TCP *:3001

lsof -nP -iTCP:5173 -sTCP:LISTEN
PASS: node listens on TCP *:5173

curl -k -I https://localhost:3001/health
PASS: HTTP/1.1 200 OK

curl -k -I https://localhost:5173/manager/
PASS: HTTP/2 200
```

```text
browser-use browser_navigate https://localhost:3001/health
PASS: health JSON rendered in the browser.

browser-use browser_navigate https://localhost:5173/manager/
PASS: reached the Manager connect screen while logged in as Eureka.

browser-use browser_click Connect
PASS: reached the main Manager UI with Published Group Controls, Clients (0), Display, Performance Mode, and Server
State panels.
```

```text
chrome-devtools reload https://localhost:5173/manager/
PASS: clean reload in isolatedContext=ff18-runtime.

chrome-devtools fill Login + Connect
PASS: reached the main Manager UI.

chrome-devtools list_console_messages includePreservedMessages=false
PASS: no certificate or SDK connection errors after navigation; only Svelte unknown-prop warnings.

chrome-devtools list_network_requests includePreservedRequests=false
PASS: Socket.IO polling requests to https://localhost:3001/socket.io returned HTTP 200.

chrome-devtools navigate to https://localhost:5173/manager/root + Connect
PASS: Root Console loaded.

chrome-devtools click Node Graph
PASS: Node Graph rendered Start control, minimap controls, and Minimap canvas.

chrome-devtools take_screenshot
PASS: saved .harness/evidence/FF-18/root-node-graph-2026-05-08.png.
```

Scope note:
- No manager key or password is recorded in this evidence.
- The clean recheck proves that the Manager socket and Root Node Graph are browser-reachable in the current local
  runtime.
- This still does not prove GS-12 gyro/device/client behavior or GS-13 live display visual output change.

## 2026-05-08 Manager Role And Product Chain Recheck

The server was restarted locally with `SHUGU_ALLOW_INSECURE_MANAGER=1` to test whether the previous `managers: []`
state was only runtime configuration. This did not modify source files.

```text
SHUGU_ALLOW_INSECURE_MANAGER=1 corepack pnpm@8.15.9 dev:server
PASS: server starts on https://localhost:3001

server log
PASS: requested=manager granted=manager

curl -k -s https://localhost:3001/clients
PASS: managers array is non-empty
PASS: display client is registered with group=display
```

This resolves the Manager role downgrade as a runtime configuration issue. It does not complete FF-18.

Additional browser-use product-chain checks:

```text
browser-use browser_navigate https://localhost:5173/manager/
PASS: Manager connect screen appears while logged in as Eureka.

browser-use browser_click Connect
PASS: Manager main UI appears.

browser-use state
PASS: Remote Display (Server group=display) is visible and connected.
PASS: Clients panel still shows Clients (0) in the tested browser state.

browser-use browser_navigate https://localhost:5174/?e2e=1&server=https%3A%2F%2Flocalhost%3A3001
PASS: Client page opens in e2e mode.

curl -k -s https://localhost:3001/clients
PASS/blocked: a normal client briefly registers, then disconnects and expires; no stable audience client remains for
GS-12 live gyro/flashlight proof.
```

Attempted display output proof through the existing Manager published group control:

```text
browser-use Manager: select Display group and click Send Color
FAIL: display page remains black.

server log
FAIL: control message rejected:
code=server.policy.scope_mismatch
path=target.groupId
message="target group must match scopeGroupId"
```

There are also repeated server rejects for existing plugin messages:

```text
code=server.policy.scope_mismatch
path=target.mode
message="scoped commands must target their scope group"
```

Scope note:
- The rejected control path is in `apps/server/**` and Manager product control wiring, which are forbidden paths under
  `.harness/goals/FF-18-review-contract.md` unless the contract is explicitly revised first.
- Fixing the product-chain rejection would require TDD first, but it is not a valid FF-18 edit under the active
  contract.
- This check proves that browser-use can perform the runtime interaction, but the product chain currently blocks GS-13
  live display visual-output proof.

## 2026-05-08 Approved Product-Proof Lane Fix

The FF-18 contract was revised and approved on 2026-05-08 to allow a bounded GS-12/GS-13 product-proof lane. The lane
did not weaken server policy. It fixed the product chain by keeping group-targeted command envelopes scoped to the
target Group and by making the Manager Published Group control reclaim the target Group before sending mutating
controls.

TDD proof:

```text
corepack pnpm@8.15.9 exec tsx --test packages/sdk-manager/src/manager-sdk.spec.ts
RED before implementation:
actual scopeGroupId="manager-performance"
expected scopeGroupId="display"

GREEN after implementation:
PASS: 13 tests, 0 failures
```

```text
corepack pnpm@8.15.9 exec tsx --test apps/manager/src/lib/stores/group-controls.spec.ts
RED before implementation:
Published Group control emitted screenColor without a preceding node-executor/reclaim command.

GREEN after implementation:
PASS: 4 tests, 0 failures
```

Focused build proof:

```text
corepack pnpm@8.15.9 --filter @shugu/sdk-manager run build
PASS

corepack pnpm@8.15.9 --filter @shugu/server run build
PASS

corepack pnpm@8.15.9 --filter @shugu/manager run build
PASS with existing Svelte/Sass/Rete warnings; no build failure.
```

Runtime/browser product proof:

```text
SHUGU_ALLOW_INSECURE_MANAGER=1 corepack pnpm@8.15.9 dev:server
PASS: local server listens on https://localhost:3001 and grants requested=manager as granted=manager.

browser-use browser_navigate https://localhost:5175/display/?server=https%3A%2F%2Flocalhost%3A3001
PASS: Display tab opened and registered as group=display.

browser-use browser_navigate https://localhost:5173/manager/
PASS: Manager connect screen opened while logged in as Eureka.

browser-use browser_click Connect
PASS: Manager main UI opened with Published Group Controls.

browser-use browser_click Display
PASS: Display published Group selected.

browser-use browser_click Send Color
PASS: command accepted by server.

server log
PASS: node-executor/reclaim accepted with actor=Eureka, role=manager, scopeGroupId=display,
target={ mode: 'group', groupId: 'display' }.
PASS: screenColor accepted with actor=Eureka, role=manager, scopeGroupId=display,
target={ mode: 'group', groupId: 'display' }.
PASS: no server.policy.scope_mismatch or server.policy.ownership_denied for the accepted Display command.

browser-use Display tab screenshot/state
PASS: Display changed from black to a full-viewport blue-purple screen.
```

Acceptance impact:
- GS-13 has bounded product-chain proof for Manager Published Display `screenColor` changing the live Display output.
- This is not full proof of the natural-language "breathing-like" AI scenario or AI observation loop.
- GS-12 remains blocked because a stable audience client/device/output chain was not proven.
- Runtime override set/clear remains explicitly deferred as `RUNTIME_OVERRIDE_SURFACE_NOT_IMPLEMENTED`.
- FF-18 remains incomplete unless the remaining missing proof receives a valid dated risk acceptance or is implemented
  under an approved contract.

## Checks

```text
mcp__chrome_devtools__.list_pages
PASS: chrome-devtools MCP returned open page inventory.

mcp__chrome_devtools__.new_page https://example.com
PASS: opened https://example.com in isolatedContext=mcp-smoke.

mcp__chrome_devtools__.take_snapshot
PASS: returned Example Domain accessibility snapshot.
```

```text
mcp__chrome_devtools__.new_page https://localhost:5173/manager/
FAIL: net::ERR_CERT_AUTHORITY_INVALID

mcp__chrome_devtools__.new_page http://localhost:5173/manager/
FAIL: net::ERR_EMPTY_RESPONSE
```

```text
curl -k -I https://localhost:5173/manager/
PASS: HTTP/2 200

lsof -nP -iTCP:5173 -sTCP:LISTEN
PASS: node listens on TCP *:5173
```

```text
curl -k -I https://localhost:3001
FAIL: curl: (7) Failed to connect to localhost port 3001

lsof -nP -iTCP:3001 -sTCP:LISTEN
FAIL: no listener on TCP 3001
```

```text
corepack pnpm@8.15.9 --filter @shugu/server run build
PASS

corepack pnpm@8.15.9 --filter @shugu/server exec tsc --noEmit -p tsconfig.dev.json
PASS
```

```text
corepack pnpm@8.15.9 --filter @shugu/server run dev
FAIL during Nest application startup:

Nest can't resolve dependencies of the ClientControlTransferService (?, Object). Please make sure that the argument
Object at index [0] is available in the EventsModule context.
```

## Scope Assessment

The 2026-05-07 startup blocker appeared to be in `apps/server/src/events/client-control-transfer.ts` and
`apps/server/src/events/events.module.ts`. The clean 2026-05-08 recheck shows the current runtime now reaches the
health endpoint, Manager socket polling succeeds, and the Root Node Graph renders.

Completing FF-18 still requires product/runtime scenario proof for GS-12 and GS-13 or a valid dated risk acceptance.
Producing that proof may require client/display/device/runtime orchestration outside
`.harness/goals/FF-18-review-contract.md` allowed implementation scope unless the contract is explicitly revised first.

## Acceptance Impact

| Criterion | Runtime result | Status |
| --- | --- | --- |
| Manager socket connection | Browser Manager connects; Socket.IO polling requests return HTTP 200 | proven |
| Root Node Graph visibility | Root Node Graph renders Start, minimap controls, and Minimap canvas; screenshot saved | proven |
| Manager role authorization | Local restart with `SHUGU_ALLOW_INSECURE_MANAGER=1` grants Manager role and `/clients` reports managers | proven as runtime config |
| GS-12 gyro rotation drives tense flashlight rhythm through graph commands | Client e2e page opens but no stable audience client/device/output chain remains registered for live gyro/flashlight proof | blocked |
| GS-13 display visual becomes breathing-like and AI observes output change | Display registers, but existing Manager Send Color path is rejected by server policy and display remains black | blocked |
| Runtime override set/clear surface | Still deferred by prior evidence; no live runtime path proven | blocked |
| Browser proof can replace deterministic fixtures | No; fixtures cannot substitute for missing runtime proof | blocked |

## Stop Condition

Stop condition is triggered: required runtime/browser/product proof for GS-12, GS-13, and runtime override set/clear is
missing. The previous browser Socket.IO certificate blocker and Manager role downgrade are resolved in the current local
runtime when the server is started with local insecure manager authorization. The remaining missing proof is product
scenario proof. Current live checks show a stable audience client is unavailable for GS-12 and the display control path
is rejected by server policy for GS-13. Fixing those product-chain blockers would require changes outside the active
FF-18 review contract scope.

## 2026-05-08 GS-12 Runtime Recheck

This recheck used only runtime/browser actions. No source files were modified.

```text
SHUGU_ALLOW_INSECURE_MANAGER=1 corepack pnpm@8.15.9 dev:server
PASS: local server listens on https://localhost:3001.
PASS: server grants requested=manager as granted=manager.

browser-use browser_navigate https://localhost:5174/?e2e=1&server=https%3A%2F%2Flocalhost%3A3001
PASS: client e2e page opens.

browser-use browser_get_html https://localhost:3001/clients
PASS: a normal audience client remains registered and connected.

chrome-devtools Manager /manager/root + Connect + Node Graph
PASS: Manager reaches Node Graph and exposes the runtime NodeEngine.

chrome-devtools temporary graph load
PASS: runtime-only GS-12 graph is present in Manager:
- client-object targets the connected audience client
- proc-client-sensors exposes gyro outputs
- proc-flashlight consumes gyro gamma as frequencyHz
- proc-flashlight command output returns to the client-object sink
PASS: Manager detects one local loop with requiredCapabilities=["flashlight","sensors"].

chrome-devtools click Deploy
FAIL: server rejects node-executor deploy:
code=server.policy.scope_mismatch
path=target.mode
message="scoped commands must target their scope group"
```

The latest GS-12 blocker is therefore no longer "no stable audience client." A stable connected audience client can be
observed in the current runtime. The remaining blocker is the Manager Node Graph deployment path: loop deploy uses a
client-targeted `node-executor` plugin command (`target.mode=clientIds`), while the current server ingress policy
requires scoped manager mutating commands to target their scope Group.

This is a valid FF-18 stop condition. Fixing the live GS-12 product chain would require changing the Node Graph loop
deployment path under `apps/manager/src/lib/components/nodes/**`, changing broader server policy, or adding a new
approved scope lane. Those paths are forbidden by `.harness/goals/FF-18-review-contract.md`.

Updated acceptance impact:

| Criterion | Runtime result | Status |
| --- | --- | --- |
| GS-12 gyro rotation drives tense flashlight rhythm through graph commands | Runtime client and Manager graph proof improved; live deploy is blocked by `server.policy.scope_mismatch` on `target.mode=clientIds` | blocked |
| GS-13 display visual becomes breathing-like and AI observes output change | Bounded Manager Published Display `screenColor` product chain is proven; full breathing-like AI scenario and AI observation loop are not product-proven | partial |
| Runtime override set/clear surface | Still deferred by prior evidence; no live runtime path proven | blocked |

## 2026-05-08 GS-12 Deploy Lane Fix Recheck

This recheck used the approved bounded FF-18 GS-12 deploy lane. It does not mark FF-18 complete and does not start
FF-19.

Focused TDD proof:

```text
corepack pnpm@8.15.9 exec tsx --test apps/manager/src/lib/components/nodes/node-canvas/controllers/loop-helpers.spec.ts
RED before implementation:
Node Graph loop deploy/stop/remove used target={ mode: "clientIds", ids: ["client-1"] }.

GREEN after implementation:
PASS: 4 tests, 0 failures
PASS: deploy sends node-executor/reclaim and node-executor/deploy to target={ mode: "group", groupId: "client:client-1" }.
PASS: stop/remove lifecycle commands target the same managed client Group.
```

```text
corepack pnpm@8.15.9 exec tsx --tsconfig apps/server/tsconfig.json --test apps/server/src/events/events.gateway.spec.ts
PASS: 7 tests, 0 failures
PASS: normal clients without an explicit group are assigned group="client:<clientId>".
PASS: explicit client groups are preserved.

corepack pnpm@8.15.9 exec tsx --tsconfig apps/server/tsconfig.json --test apps/server/src/events/events.gateway.command-envelope.spec.ts
PASS: 11 tests, 0 failures
PASS: node-executor deploy scoped to target={ mode: "group", groupId: "client:client-1" } is accepted and audited.

corepack pnpm@8.15.9 exec tsx --test packages/sdk-manager/src/manager-sdk.spec.ts
PASS: 13 tests, 0 failures
```

Runtime/browser proof against current source on `https://localhost:3301`:

```text
PORT=3301 SHUGU_ALLOW_INSECURE_MANAGER=1 NODE_ENV=development corepack pnpm@8.15.9 --filter @shugu/server run dev
PASS: current source server starts on https://localhost:3301.

chrome-devtools https://localhost:3301/health
PASS: health JSON renders in the browser after accepting the local certificate.

chrome-devtools client e2e page:
https://localhost:5174/?e2e=1&server=https%3A%2F%2Flocalhost%3A3301
PASS: client registers with the current source server.

chrome-devtools fetch https://localhost:3301/clients
PASS: normal clients are connected with managed groups:
- group="client:c_ed172239e034"
- group="client:c_ed172239e034_1"

chrome-devtools Manager /manager/root + Connect + Node Graph
PASS: Manager connects as manager and exposes window.__shuguNodeEngine.

chrome-devtools temporary graph load
PASS: runtime-only GS-12 graph is present in Manager:
- client-object targets connected client c_ed172239e034
- proc-client-sensors gyroG feeds proc-flashlight frequencyHz
- proc-flashlight cmd returns to the client-object sink
PASS: Manager detects one local loop requiring ["flashlight","sensors"].

chrome-devtools click Deploy
PASS: server no longer rejects node-executor deploy with server.policy.scope_mismatch path=target.mode.
PASS: server no longer rejects node-executor deploy with server.policy.ownership_denied.
PASS: server audit accepted node-executor/reclaim with
scopeGroupId="client:c_ed172239e034" and target={ mode: "group", groupId: "client:c_ed172239e034" }.
PASS: server audit accepted node-executor/deploy with
scopeGroupId="client:c_ed172239e034" and target={ mode: "group", groupId: "client:c_ed172239e034" }.

Manager dialog
BLOCKED: Deploy failed: missing required capabilities: flashlight.

chrome-devtools client e2e command capture
PASS/BLOCKED: no flashlight command was executed after the capability rejection; only setSensorState was captured.
```

The latest GS-12 blocker is therefore narrowed again. The Node Graph deploy lane now satisfies the server scope and
ownership boundaries. The remaining runtime blocker is capability/product proof: the desktop e2e client used for this
check does not advertise `flashlight`, so the executor rejects the deploy before a flashlight command can execute.

Updated acceptance impact:

| Criterion | Runtime result | Status |
| --- | --- | --- |
| GS-12 gyro rotation drives tense flashlight rhythm through graph commands | Managed Group deploy is now accepted by server policy and ownership; live flashlight execution remains blocked because the current e2e client lacks `flashlight` capability | blocked |
| GS-13 display visual becomes breathing-like and AI observes output change | Bounded Manager Published Display `screenColor` product chain is proven; full breathing-like AI scenario and AI observation loop are not product-proven | partial |
| Runtime override set/clear surface | Still deferred by prior evidence; no live runtime path proven | blocked |

## 2026-05-09 GS-12 Capability Runtime Proof

This recheck used the approved adaptive FF-18 client e2e/runtime proof lane. It does not mark FF-18 complete and does
not start FF-19.

Focused TDD proof:

```text
wc -l apps/client/src/lib/stores/client/client-runtime.ts apps/client/src/lib/stores/client/client-runtime-capabilities.ts
PASS: client-runtime.ts is 413 lines after pure capability-helper extraction, below the hotspot ratchet.

corepack pnpm@8.15.9 exec tsx --test apps/manager/src/lib/components/nodes/node-canvas/controllers/loop-helpers.spec.ts
PASS: 5 tests, 0 failures
PASS: deployLoop records pending state before dispatching node-executor/deploy, preventing fast rejected/deployed
responses from being missed and misreported as deploy timeouts.

corepack pnpm@8.15.9 exec tsx --test apps/client/src/lib/stores/client/client-runtime.spec.ts
PASS: 2 tests, 0 failures
PASS: normal runtime denies flashlight when camera permission is denied.
PASS: explicit DEV e2e proof mode can allow flashlight capability without changing the production camera gate.
```

Runtime/browser proof against current source with temporary isolated server/manager/client ports:

```text
Temporary server env:
PORT=<free> SHUGU_ALLOW_INSECURE_MANAGER=1

Temporary manager env:
VITE_SHUGU_MANAGER_DEV_PASSWORD=521184

Manager route:
https://localhost:<managerPort>/manager/root

Client route:
https://localhost:<clientPort>/?server=https%3A%2F%2Flocalhost%3A<serverPort>&e2e=1
```

Negative capability proof:

```text
PASS: Manager connects as manager and Root Node Graph exposes window.__shuguNodeEngine.
PASS: Client e2e page registers as c_e2e_deploy_no_timeout.
PASS: Manager loads GS-12-shaped graph:
- client-object targets c_e2e_deploy_no_timeout
- proc-client-sensors feeds proc-flashlight frequencyHz
- proc-flashlight cmd returns to client-object sink
PASS: Manager starts NodeEngine and sends node-executor/reclaim plus node-executor/deploy to the managed client Group.
PASS: Client receives node-executor deploy.
PASS: Client NodeExecutor rejects deploy with error "missing required capabilities: flashlight".
PASS: Manager dialog is exactly "Deploy failed: missing required capabilities: flashlight".
PASS: No "Deploy timeout" dialog appears.
PASS: Client e2e command capture contains no flashlight command after rejection.
```

Positive DEV e2e proof-lane runtime proof:

```text
PASS: Client page explicitly sets window.__SHUGU_E2E=true and window.__SHUGU_E2E_FLASHLIGHT_PROOF=true.
PASS: Manager connects as manager and client registers as c_e2e_flashlight_proof.
PASS: Manager loads the same GS-12-shaped graph and detects a loop requiring ["flashlight","sensors"].
PASS: Manager clicks Deploy and no deploy failure/timeout dialog appears.
PASS: Client receives node-executor/reclaim and node-executor/deploy.
PASS: Client NodeExecutor reports deployed for loop:node-client-e2e:1ct6gic.
PASS: Manager UI shows Remote running/deployed and Stop Loop.
PASS: Client e2e command capture records a real NodeExecutor command-path entry:
  { action: "flashlight", payload: { mode: "blink", frequency: 1.4971606587399926, dutyCycle: 0.5 } }
```

Updated acceptance impact:

| Criterion | Runtime result | Status |
| --- | --- | --- |
| GS-12 gyro rotation drives tense flashlight rhythm through graph commands | Live Manager/Client/Server deploy reaches client NodeExecutor and records a `flashlight` command in explicit DEV e2e proof mode; normal camera-denied runtime still rejects flashlight capability without timeout | runtime-proven for e2e proof lane |
| GS-13 display visual becomes breathing-like and AI observes output change | Bounded Manager Published Display `screenColor` product chain is proven; full breathing-like AI scenario and AI observation loop are not product-proven | partial |
| Runtime override set/clear surface | Still deferred by prior evidence; no live runtime path proven | blocked |
