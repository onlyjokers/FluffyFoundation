<!--
Purpose: Record real runtime/browser investigation evidence for FF-18 acceptance reconciliation.
-->

# FF-18 Runtime Browser Investigation

Date: 2026-05-07

## Result

FF-18 runtime/browser/product proof is still blocked. The local Manager app is reachable, chrome-devtools MCP and
browser-use MCP are available, and the server health endpoint is reachable. Manager login succeeds with the local dev
password, but Manager cannot establish the Socket.IO manager connection because browser requests to the server are
blocked by the local HTTPS certificate authority error.

This evidence does not mark FF-18 complete and does not start FF-19.

## 2026-05-08 Update

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
- The browser proof now reaches the authenticated connect screen, but it does not prove workspace/canvas operation.
- This is runtime/browser proof of the current blocker, not product proof for GS-12 or GS-13.

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
`apps/server/src/events/events.module.ts`. The 2026-05-08 runtime reaches the health endpoint, but the browser manager
socket path is still blocked by HTTPS certificate trust.

Fixing runtime/browser proof may require changing certificate/dev-server configuration, manager SDK connection behavior,
or server runtime wiring. Those paths are outside `.harness/goals/FF-18-review-contract.md` allowed implementation
scope unless the contract is explicitly revised first.

## Acceptance Impact

| Criterion | Runtime result | Status |
| --- | --- | --- |
| GS-12 gyro rotation drives tense flashlight rhythm through graph commands | Cannot prove; Manager socket connection fails with certificate authority errors | blocked |
| GS-13 display visual becomes breathing-like and AI observes output change | Cannot prove; Manager socket connection fails with certificate authority errors | blocked |
| Runtime override set/clear surface | Still deferred by prior evidence; no live runtime path proven | blocked |
| Browser proof can replace deterministic fixtures | No; fixtures cannot substitute for missing runtime proof | blocked |

## Stop Condition

Stop condition is triggered: required runtime/browser/product proof is missing. The latest blocker is a real browser
Socket.IO connection failure caused by local certificate authority errors, and obtaining workspace/canvas proof may
require product/runtime or dev-certificate changes outside the FF-18 review contract scope.
