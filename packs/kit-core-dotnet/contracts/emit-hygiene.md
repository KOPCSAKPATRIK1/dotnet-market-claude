---
name: emit-hygiene
version: 1.1.0
kind: contract
pack: kit-core-dotnet
status: candidate
incident: none yet
applies-when: writing any code
---

# Emit hygiene

## Failure class

Generated code that carries noise: comments that narrate what the next line obviously does,
helpers extracted for a single call site, defensive branches for states that cannot occur,
"just in case" options nobody asked for. Each looks harmless; together they hide the one comment
or branch that actually matters, and they make the next diff larger than the change.

## How to diagnose

For every comment in your diff: does it explain a *why* or a non-obvious meaning the code can't
show? For every new function, type or option: is there more than one caller or a real reason to
separate it? For every guard: which actual input reaches it?

## What to do

- Keep comments for the non-obvious why. Delete the rest.
- Inline single-use helpers unless the name carries real meaning.
- Match the surrounding file's comment density and idiom.
