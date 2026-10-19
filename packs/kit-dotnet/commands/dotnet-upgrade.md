---
description: Upgrade the solution one .NET major version (TFM, SDK, Microsoft packages together) with the official migration skill, then re-scan and check
argument-hint: "<target major, e.g. 10>"
---

# dotnet-upgrade

## When

Moving the solution to the next .NET major (one major at a time). Not for patch updates.

## Steps

1. Confirm a clean working tree (`git status`) and a green build on the current version. Create a
   branch `upgrade/dotnet-$ARGUMENTS`.
2. Read `.claude/conventions/workspace.md` for the current target frameworks, `global.json`,
   Central Package Management and the package list.
3. Use the official migration skill for this step when one exists (the dotnet-upgrade plugin
   ships `migrate-dotnet8-to-dotnet9`, `migrate-dotnet9-to-dotnet10`,
   `migrate-dotnet10-to-dotnet11`). For older versions ask the Microsoft Learn MCP for the
   "breaking changes in .NET <major>" pages; don't migrate from memory.
4. Change every `TargetFramework(s)` (keep platform suffixes such as `-windows10.0.19041.0`),
   `global.json` and the CI SDK version together.
5. Move the Microsoft packages that follow the runtime version (`Microsoft.EntityFrameworkCore.*`,
   `Microsoft.AspNetCore.*`, `Microsoft.Extensions.*`, database providers) to the same major,
   in `Directory.Packages.props` when CPM is on. Check third-party providers support the new major
   (NuGet MCP) before moving them.
6. Build, fix the breaking changes the skill or the docs list, run the tests. With EF Core, check
   for pending model changes (`dotnet ef migrations has-pending-model-changes`).
7. `kit-dotnet scan` and review `git diff .claude/conventions/`.

## Verify

- Build and tests pass with the commands from workspace.md.
- `kit-dotnet stale` reports nothing.
- Every manual item is either done or recorded in `.claude/decisions/adr/` with the reason it's
  deferred.

## Rollback

`git checkout <previous branch>` and delete the upgrade branch. Nothing outside the repo was
changed except the NuGet cache; run `dotnet restore` after switching back.
