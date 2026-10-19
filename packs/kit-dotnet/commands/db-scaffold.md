---
description: Re-scaffold the EF Core model from the database in a database-first repo without losing hand-written code
argument-hint: "[connection string name or table list, optional]"
---

# db-scaffold

## When

The repo is database-first (data.md: "model source: scaffolded from the database") and the
schema changed. Not for code-first repos; use `/ef-migration` there.

## Steps

1. Read `.claude/conventions/data.md` for the DbContext, its project, the provider and the folder
   of the scaffolded entities. Read `kit contract migration-history`.
2. Find how the repo scaffolds: a script, a README line, or the provider and options visible in
   the generated context (`partial` classes, `OnModelCreatingPartial`). Ask the user for the
   connection; never write a connection string with a password into a command you commit.
3. Run `dotnet ef dbcontext scaffold "<connection>" <provider package> --project <data project>
   --context <DbContext> --output-dir <entities folder> --context-dir <context folder> --force`
   with the same naming options the repo used before (`--use-database-names`, `--no-onconfiguring`,
   `--data-annotations`).
4. Generated files are never edited by hand. Hand-written code lives in a second `partial` class
   file or in `OnModelCreatingPartial`; if a generated file had manual edits, move them there
   before re-scaffolding.
5. Commit the schema script (if the repo keeps one) together with the scaffolded model.
6. `kit scan data` and review the diff.

## Verify

- Build and tests pass.
- `git diff` of the generated folder contains only scaffold output.
- No hand-written change was lost (compare with the previous commit).

## Rollback

`git checkout -- <entities folder> <context file>` restores the previous model.
