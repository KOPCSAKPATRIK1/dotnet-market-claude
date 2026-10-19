---
name: self-descriptive-naming
version: 1.1.0
kind: contract
pack: kit-core-dotnet
status: candidate
incident: none yet
applies-when: naming anything (file, project, namespace, class, method, property, variable, route)
---

# Self-descriptive naming

## Failure class

A name that only makes sense with its surrounding code (`data`, `item2`, `handle`, `flag`,
`temp`, `service`) forces every reader, human or model, to reconstruct context. Models then guess,
and a confident wrong guess about what `value` holds becomes a wrong edit.

## How to diagnose

Read the identifier alone, as it appears in a search result or an import list. Can you say
which domain thing it is and what role it plays? If not, it fails.

## What to do

- Name = domain + role: `segmentFilters`, `orderRepository`, `ImportSegmentsAsync`, `AuthGuard`.
- Booleans read as a yes/no question: `isLoggedIn`, `hasFilters`.
- When writing code, apply it. When reviewing, report it as a finding, but don't rename code the
  diff didn't touch; that belongs in its own change.
