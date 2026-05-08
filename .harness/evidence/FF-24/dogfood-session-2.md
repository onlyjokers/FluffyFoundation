<!--
Purpose: FF-24 second dogfood rehearsal report with real runtime proof and recovery notes.
-->

# FF-24 Dogfood Session 2

Date: 2026-05-09
Release candidate: `8edc070`
Runtime proof: real

## Scenario

Launch-readiness rehearsal focused on repeating the release-candidate golden suite and FF-24 evidence validation from
the active checkout. The session uses actual local commands and tracked evidence paths.

## Commands Run

- `corepack pnpm@8.15.9 test:golden`
- `node .harness/evidence/FF-24/validate-launch-readiness.mjs`
- Browser MCP / Playwright tab open: `https://localhost:5179/manager`
- Browser MCP / Playwright tab open: `https://localhost:5178/display?server=https%3A%2F%2Flocalhost%3A3001`
- Browser MCP / Playwright attempted open: `https://localhost:5177/?server=https%3A%2F%2Flocalhost%3A3001`
- Independent Playwright browser context with `ignoreHTTPSErrors: true` opened
  `https://localhost:5177/?server=https%3A%2F%2Flocalhost%3A3001`

## Observed Result

The golden-suite command is the release-candidate proof required by FF-24. The launch-readiness validator checks the
operator manual, developer guide, two dogfood reports, prior FF-18 through FF-23 evidence, accepted risk records, and
final launch review.

Browser/runtime observations:

- Manager page opened at `https://localhost:5179/manager/` with title `Fluffy Core Manager`.
- Display page opened at `https://localhost:5178/display/?server=https%3A%2F%2Flocalhost%3A3001` with title
  `ShuGu Display`.
- Display console showed `[SDK Client] Connected` and registration as `d_59018c630023`.
- Client page attempted at `https://localhost:5177/?server=https%3A%2F%2Flocalhost%3A3001` but stopped at
  `net::ERR_CERT_AUTHORITY_INVALID` in the shared MCP browser context.
- Client page then opened in an independent Playwright context configured with `ignoreHTTPSErrors: true`; title was
  `Fluffy Foundation`, body sample was `Enter`, and screenshot/JSON proof was saved.

## Recovery notes:

The RED validator initially failed because FF-24 evidence did not yet include manuals, dogfood reports, golden output,
or final launch review. Recovery was to add the missing FF-24 documentation and evidence within the contract's allowed
paths, without changing product/runtime code or weakening any prior gate.

Client browser proof recovery used a dedicated Playwright context with HTTPS errors ignored for localhost only; this
does not weaken production TLS or app security gates.
Runtime proof: real
