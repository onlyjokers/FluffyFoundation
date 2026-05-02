<!--
Purpose: Record the FF-06 server state strategy decision and production multi-instance contract.
-->

# ADR FF-06 - Server State Strategy

## Decision

FF-06 chooses explicit single-server production mode.

The server process is the only owner of registry, client selection, ownership, and the control-plane snapshot. Redis
may not be used as a production Socket.IO broadcast adapter until registry/control-plane state is moved to shared
state and a publish/subscribe convergence proof exists.

## Rationale

Current runtime truth lives in `ClientRegistryService`: connected clients, managers, selected clients, groups, and
manager authorization checks are process-local. The existing Redis adapter only broadcasts Socket.IO packets; it does
not replicate registry membership, selection, ownership, or control-plane snapshot state. Running multiple production
instances with Redis would therefore make delivery look clustered while semantic truth remains split by process.

Choosing shared state would require a durable registry/control-plane store plus convergence and conflict behavior.
That is outside the FF-06 bounded repair and belongs in a later explicit shared-state task.

## Contract

- Production mode rejects `REDIS_URL` unless the Redis adapter is explicitly disabled.
- Production mode rejects clustered process hints: `WEB_CONCURRENCY`, `INSTANCES`, and `NODE_APP_INSTANCE`.
- `SHUGU_STATE_STRATEGY` must be empty or `single-server`.
- Server logs and HTTP/SystemMessage status expose the active strategy and state owners.
- Manager state consumes the server control-plane snapshot and surfaces the active strategy in the dashboard.
- Manager SDK detects a mismatch between client `selected` flags and the control-plane selection snapshot, then
  records an error instead of silently accepting divergent ownership truth.

## Recovery And Rollback

Rollback is safe by removing the FF-06 state-strategy guard and snapshot fields, but that reopens the Redis/local-truth
ambiguity. Operational recovery for a rejected production boot is to run one server process, unset `REDIS_URL`, or set
`DISABLE_REDIS_ADAPTER=1` while keeping one active process.
