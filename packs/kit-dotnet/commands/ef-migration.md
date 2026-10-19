---
description: Add an EF Core migration the way this repo does it, review it for data loss, and check nothing is left pending
argument-hint: "<MigrationName>"
---

# ef-migration

## When

The EF Core model changed (entity, configuration, DbContext) in a code-first repo. Not for a
database-first repo: data.md says which one this is; for database-first use `/db-scaffold`.

## Steps

1. Read `.claude/conventions/data.md`: the DbContext, its project, the startup project and the
   migrations folder. With more than one DbContext, ask which one changed; don't guess.
2. Read `kit-dotnet contract migration-history`.
3. Check `dotnet ef --version` has the same major as the EF Core packages in data.md. If not,
   stop and give the install command (`dotnet tool update --global dotnet-ef --version <major>.*`).
4. Run `dotnet ef migrations add $ARGUMENTS --project <data project> --startup-project <startup project> --context <DbContext>`
   (add `--output-dir` when data.md names a non-default folder).
5. Read the generated `Up` and `Down`. List every data-losing step: dropped column or table,
   narrowed type, renamed column generated as drop + add, new non-null column without a default.
   Fix renames with `RenameColumn`; ask the user about every other one.
6. If the model has seed data (`HasData`), make sure no value is non-deterministic
   (`DateTime.Now`, `Guid.NewGuid()`), or every run will generate a new migration.
7. `dotnet ef migrations has-pending-model-changes` (EF Core 8+) with the same arguments.
8. `kit-dotnet scan data` and review the diff.

## Verify

- Build and tests pass with the commands from workspace.md.
- No pending model changes.
- The pull request names every data-losing step, or says there is none.

## Rollback

Only while the migration hasn't been applied to a shared database:
`dotnet ef migrations remove` with the same project arguments. If it was applied locally, first
`dotnet ef database update <previous migration>`. After it ran anywhere shared, add a new
migration instead.
