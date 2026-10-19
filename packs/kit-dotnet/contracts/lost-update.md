---
name: lost-update
version: 1.0.0
kind: contract
pack: kit-dotnet
status: candidate
incident: none yet
applies-when: update endpoint or command, edit form, PUT/PATCH, toggle, stock or counter change, background job writing the same rows
---

# Lost update

## Failure class

Read, modify, write without a concurrency check: two actors read the same row, both change it,
and the later save silently overwrites the earlier one. Toggles and counters are the worst case:
"flip the flag" or "stock = read value - 1" computed in memory gives the wrong result when two
requests interleave. Nothing fails; the data is just wrong.

## How to diagnose

For every write path in the diff, ask whether a second actor (another user, another window, a
background job, a retry) can come between the read and the save. If yes, how would the second
save notice? Updating every column (`EntityState.Modified`) from a stale copy is a sign that it
wouldn't.

## What to do

- Add a concurrency token (`rowversion` / `[Timestamp]` / `IsConcurrencyToken`) to rows that are
  edited concurrently; handle `DbUpdateConcurrencyException` with a 409 or a "reload and retry"
  message, and make sure the client knows what to do with it.
- Do counters and toggles in the database (`ExecuteUpdate`, `SET x = x - 1`), not in memory.
- Update only the properties the user changed, from the tracked entity, not a whole detached copy.
