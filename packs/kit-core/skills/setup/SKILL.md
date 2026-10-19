---
name: setup
description: Sets up or repairs the AI kit in a repository - creates the .claude/ skeleton, runs the first scan, and checks that the SDK, the language server, the MCP servers and the official skills are reachable. Use this whenever a repo is opened for the first time with the kit installed, when .claude/conventions/ is missing, when `kit status` or `kit stale` reports something stale or missing, or when the user asks to "set up the kit", "initialise conventions", "why isn't the LSP/MCP working", or similar.
metadata:
  version: 1.0.0
  kind: scanner
---

# Setup

You are a thin driver. The `kit` command does the work; your job is to read its status, decide
what to run, and tell the user plainly what changed and what still needs them.

## Steps

1. Run `kit status` from the repository. If `kit` isn't found, the stack pack (e.g. kit-dotnet)
   isn't enabled: say so and stop.
2. Read each row and act:
   - **conventions missing** → `kit init`, then `kit scan`. Show the user the list of created files.
   - **N stale** → run `kit stale`, then `kit scan` for the listed topics, and show
     `git diff --stat .claude/`.
   - **CLAUDE.md imports router: no** → `kit init` (it only appends the import, never rewrites).
   - **an SDK, a tool or a language server missing** → give the install command the row shows;
     don't run a global install yourself. The user decides.
   - **an official plugin not installed** → its marketplace is missing or the dependency failed:
     point the user to the Errors tab of the plugin manager (/plugin in Claude Code).
3. If this was the first scan, offer the `convention-creator` skill: the scan sees facts, not
   intent, and a few questions turn the facts into rules. When the scan found more than one
   database context or startup project, always ask which pair belongs together.
4. Suggest committing `.claude/` (except `.claude/.state/`, which `kit init` gitignored).

## Report

End with a short table: what's ready, what's degraded and its fallback, what the user should do.
A degraded tool that nobody mentions is indistinguishable from a working one, so list every
fallback explicitly.
