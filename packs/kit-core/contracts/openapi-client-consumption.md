---
name: openapi-client-consumption
version: 1.0.0
kind: contract
pack: kit-core
status: candidate
incident: none yet
applies-when: touching a generated API client or the data it returns
---

# Consuming a generated API client

## Failure class

The client is generated from a spec. When the server's response doesn't match the generated
types (a field is null, renamed or missing), the tempting fix is a null-guard or a cast at the
call site. That hides a spec error: the next regeneration still lies, every other caller still
trusts the wrong type, and the guard spreads.

## How to diagnose

When data from the client is missing or the wrong shape, compare the real response (network tab,
logs) with the spec. If they disagree, the spec is the bug.

## What to do

- Fix the spec (or ask its owner to), then regenerate. Don't edit generated files by hand: the
  next regeneration overwrites them.
- A null-guard at the call site is acceptable only as a temporary bridge with a comment linking
  the spec fix.
- Mapping from DTO to app model happens in one place per DTO, not in UI components, view models
  or controllers.
