<!--
Purpose: FF-24 developer guide for extending nodes, plugins, connectors, validation, tests, and AI descriptions.
-->

# Developer Guide

## Nodes

Add nodes through the registry path used by node-core and Manager specs. A node definition must describe ports, params,
runtime behavior, validation constraints, and user-facing labels. Avoid special-case switches when a registry factory can
own the behavior.

## Plugins

Plugins must declare capabilities, lifecycle expectations, and build/runtime boundaries. Keep plugin code isolated from
Manager UI state and command-bus policy so plugins cannot become god objects.

## Connectors

Connectors move data between nodes, Groups, Clients, Displays, and SDK surfaces. A connector must preserve typed payloads,
scope metadata, and rollback/audit expectations. Do not use ad hoc string payloads when protocol or registry structures
exist.

## Registry

The registry is the source of truth for agent-readable behavior. Registry entries must include IDs, categories, ports,
params, runtime hints, and AI descriptions. Keep generated or built registry outputs in sync with source changes.

## Validation

Validation must run before apply. New node or connector behavior should fail with structured errors that include path,
severity, reason, and repair options. Validation must not weaken scope, policy, audit, rollback, or redaction gates.

## Tests

Use TDD for behavior changes. Add focused tests before production code, confirm RED failure, implement the minimal GREEN
change, then run phase validation. For runtime claims, deterministic tests are not enough; add browser/runtime evidence
when the contract requires it.

## AI Descriptions

AI descriptions should tell the operator what a node or command does, what inputs it needs, what outputs it changes, and
what policy boundaries apply. They must not expose secrets or imply that AI can bypass command-bus validation.
