---
name: nullability-across-layers
version: 1.0.0
kind: contract
pack: kit-dotnet
status: candidate
incident: none yet
applies-when: new or changed field, nullable or required, database column, DTO, mapping, view model
---

# Nullability across layers

## Failure class

A value is optional in one layer and mandatory in the next: the C# property, the database
column, the DTO, the spec's `required` list, the view model or the TypeScript type disagree. The
null surfaces far from the change, as a `NullReferenceException`, a failed insert, a blank field
on screen or a hidden `= null!` that promised a value nobody sets. `#nullable disable`, `!` and
`#pragma warning disable CS86xx` are the usual places where the disagreement is silenced.

## How to diagnose

Follow the field through every layer it crosses: entity, column (configuration or migration),
DTO, mapping, endpoint or view model, client type. At each step it either has the same
nullability, or exactly one explicit mapping decides what happens to a missing value (a default,
a validation error, a skipped row). Every `null!`, `!` or suppressed nullable warning on the path
needs a reason.

## What to do

- Keep `<Nullable>enable</Nullable>` on and treat nullable warnings in changed code as errors.
- Decide the nullability once, at the source of truth (usually the column), and carry it through
  every layer unchanged.
- Validate at the boundary where input enters (request, form, import) rather than guarding
  deep inside the business code.
- Don't silence the warning with `!` or `null!` to make the build green; fix the type or the
  mapping.
