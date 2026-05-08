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
| GS-12 gyro rotation drives tense flashlight rhythm through graph commands | Cannot prove from Manager/root visibility; no live gyro/client/device/output scenario executed | blocked |
| GS-13 display visual becomes breathing-like and AI observes output change | Cannot prove from Manager/root visibility; no live display visual-output scenario executed | blocked |
| Runtime override set/clear surface | Still deferred by prior evidence; no live runtime path proven | blocked |
| Browser proof can replace deterministic fixtures | No; fixtures cannot substitute for missing runtime proof | blocked |

## Stop Condition

Stop condition is triggered: required runtime/browser/product proof for GS-12, GS-13, and runtime override set/clear is
missing. The previous browser Socket.IO certificate blocker is resolved in the current local runtime. The remaining
missing proof is product scenario proof, and obtaining it may require client/display/device/runtime orchestration outside
the FF-18 review contract scope.
