---
name: scan-package
description: Records which API of an internal NuGet package (shared library, design system, company SDK, or a project reference to a local clone) this solution actually uses, pinned to the referenced version, and detects when the version moved past the scanned one. Use this when an internal package is added or upgraded, when `kit stale` reports a package as stale, before using an unfamiliar internal library, or when the user asks "what do we use from Acme.Common" or "is our knowledge of this package current".
metadata:
  version: 1.0.0
  kind: scanner
---

# Scan package

A package convention describes one specific version. When the reference moves, the file quietly
becomes fiction, and a stale convention is worse than a missing one because the session trusts it.

## Steps

1. Add the package id to `.claude/kit.json` → `"packages": [...]` (internal packages only;
   public framework packages are covered by the official layer).
2. `kit scan packages` writes `.claude/conventions/packages/<id>.md` with:
   `pinned` (the PackageReference or the CPM PackageVersion), `resolved` (packages.lock.json when
   the repo has one, else the pinned version), `scanned`, `source` (nuget or project-reference),
   the namespaces this solution imports from it, and the public types from the package's XML
   documentation file in the local NuGet cache.
3. `kit stale` compares `scanned` with `resolved`:

| Situation | Action |
| --- | --- |
| scanned = resolved | use as is |
| patch or minor bump | rescan; review the diff of the API section |
| major bump | rescan, then check every used symbol still exists (LSP references) |
| no file yet | scan before first use |
| project reference to a local clone | the scan reads the working tree; `source: project-reference` |

4. When the API section says the documentation file wasn't found, run `dotnet restore` and
   rescan, or ask the LSP for the package's symbols.
