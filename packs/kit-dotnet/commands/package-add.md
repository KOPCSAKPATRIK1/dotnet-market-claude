---
description: Add a NuGet package the way this repo manages packages, with a version checked for compatibility and known vulnerabilities
argument-hint: "<package id> [project]"
---

# package-add

## When

A new NuGet dependency is needed. Not for upgrading the Microsoft packages that follow the .NET
version; use `/dotnet-upgrade` for that.

## Steps

1. Read `.claude/conventions/workspace.md`: Central Package Management on or off, the target
   frameworks, and the project that should own the dependency (architecture.md shows the layers;
   a package belongs to the lowest layer that needs it).
2. Ask the NuGet MCP for the newest version compatible with the target frameworks and for known
   vulnerabilities. Without the MCP: `dotnet package search <id>` and
   `dotnet list package --vulnerable` after adding.
3. Add it the repo's way:
   - CPM on: a `<PackageVersion>` in `Directory.Packages.props` and a version-less
     `<PackageReference>` in the project (`dotnet add <project> package <id>` does both).
   - CPM off: `dotnet add <project> package <id> --version <version>`.
4. If the package is internal (your organisation's), add its id to `.claude/kit.json` →
   `"packages"` and run `kit scan packages`.
5. `kit scan workspace` and review the diff.

## Verify

- `dotnet restore` and the build pass; no new vulnerability warning (`NU1901`–`NU1904`).
- The package is referenced only by the project that needs it.

## Rollback

`dotnet remove <project> package <id>` (and delete the `PackageVersion` line with CPM).
