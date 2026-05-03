<!--
Purpose: Track the active harness phase for Looooper Plan/Work/Review sessions.
-->

# Current Phase

FF-07 - Realtime Delivery Contract, Backpressure, And Final-Value Semantics

## Previous Acceptance

FF-06 was accepted and committed as `74aa818 Add single-server state strategy guard`.

## Active Claim

Make realtime throttling predictable instead of two layers silently dropping state.

## Work Status

FF-07 implementation is ready for Review. Work added the shared delivery contract, SDK/server backpressure behavior,
latest-state replay/removal semantics, metrics, deterministic tests, and bounded load evidence.
