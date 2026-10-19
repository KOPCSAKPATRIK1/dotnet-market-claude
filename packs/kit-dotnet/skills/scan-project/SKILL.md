---
name: scan-project
description: Regenerates the repo's convention files (workspace, architecture, data, api, di, ui, validation, mapping, testing, lint) from the solution with the deterministic `kit-dotnet scan`, then explains what changed. Use this when a .csproj, Directory.Build.props, Directory.Packages.props, global.json, a DbContext, entity configuration, migrations, endpoints, DI registrations or the test setup changed, after a .NET upgrade, when `kit-dotnet stale` reports stale conventions, or when the user asks to "rescan", "refresh conventions", or "what does this solution use".
metadata:
  version: 1.1.0
  kind: scanner
---

# Scan project

The conventions are a regenerable cache of facts about the code. They must never be edited by
hand, and they must match the code exactly, or the session trusts fiction. The scanners read
project files and C# source as text: they need no SDK and no build, so they also run in CI and
in cloud sessions.

## Steps

1. `kit-dotnet stale` to see which topics are out of date (exit 1 means something is stale).
2. `kit-dotnet scan <topic…>` for those topics, or `kit-dotnet scan` for everything. The output is deterministic:
   the same code always produces byte-identical files, so a diff means the code really changed.
3. `git diff .claude/conventions/` and summarise the changed facts in plain words
   ("data: a second DbContext, ReportingContext, in Acme.Reporting").
4. If a change creates an ambiguity (a new pattern competing with an old one), suggest
   `convention-creator`.

## Merge conflicts in generated files

`.gitattributes` marks `.claude/conventions/**` as `merge=binary`: git keeps one side and flags
the conflict instead of writing conflict markers. Resolve it by running `kit-dotnet scan` on the merged
code and adding the result. Neither side is authored work, and both are stale against the merge.

## If you know something the scanner doesn't

Don't write it into a generated file; the next scan deletes it. It's a decision: add it to
`.claude/decisions/traps.md` or `decisions/conventions.md`.
