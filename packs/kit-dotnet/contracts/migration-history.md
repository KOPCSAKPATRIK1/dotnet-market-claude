---
name: migration-history
version: 1.0.0
kind: contract
pack: kit-dotnet
status: candidate
incident: none yet
requires: efcore
applies-when: migration, ModelSnapshot, entity or model configuration change, schema script, merge of branches that touched the model
---

# Migration history

## Failure class

The schema history is shared state, like a published API. Editing a migration that already ran
somewhere, two branches adding migrations in parallel, a model change without a migration, or a
schema changed by hand on one server makes the schema in another environment silently differ
from the code. It fails later and elsewhere: a missing column in production, a migration that
can't be applied, data lost by a `Down` nobody read.

In a database-first repo (the model is scaffolded from the database) the same class appears as a
schema script and a scaffolded model that no longer match.

## How to diagnose

For every migration (or schema script) in the diff, say where it already ran: only locally, on a
shared database, in production. After a merge, check for pending model changes
(`dotnet ef migrations has-pending-model-changes`, EF Core 8+). Read every `Up` and `Down` for
data-losing steps: dropped columns or tables, narrowed types, new non-null columns without a
default.

## What to do

- Never edit a migration that ran outside your machine; add a new one.
- When two branches both added migrations, regenerate the later one on top of the merged model;
  don't hand-fix the snapshot.
- A model change and its migration (or schema script and re-scaffold) go in the same commit.
- Use `/ef-migration` (code-first) or `/db-scaffold` (database-first); data-losing steps are named
  in the pull request.
