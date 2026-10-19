---
name: api-spec-fidelity
version: 1.0.0
kind: contract
pack: kit-dotnet
status: candidate
incident: none yet
applies-when: endpoint, controller action, DTO, enum, JSON options, OpenAPI document
pairs-with: openapi-client-consumption
requires: aspnetcore
---

# API spec fidelity

## Failure class

The published OpenAPI document and the real response disagree: a property the spec calls
required comes back null, an enum is serialised as a number while the spec says string (or the
reverse), a date has a different format, an action returns a type the spec doesn't describe, an
error response has no schema. Every client generated from the spec then lies to its callers, and
guards grow at the call sites of the consuming app instead of a fix at the source.

This is the server half of `openapi-client-consumption`.

## How to diagnose

For every endpoint the diff changes, put one real response next to its schema: status codes,
required properties, nullability, enum representation, date format, error body. The spec is a
committed file (see api.md), so the pull request's diff of that file is the contract change;
read it as such.

## What to do

- Make the code the source of the spec, and commit the generated document. Regenerate it with
  `/openapi-export` whenever an endpoint, a DTO or the JSON options change.
- Declare every response type and status code an action can return, including errors
  (ProblemDetails or the repo's error type from api.md).
- Nullability in the spec must come from the C# types (`string?` vs `string`, `required`); don't
  patch the document by hand.
- A breaking change to the spec is announced to the consumers in the same pull request.
