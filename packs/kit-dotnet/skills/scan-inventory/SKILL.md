---
name: scan-inventory
description: Rebuilds the grep-able symbol index (classes, interfaces, records, enums, DbContexts with their DbSets, controllers, minimal API endpoints, each with file:line) used when the Roslyn language server isn't available. Use this when files were created, moved or renamed, when a symbol lookup in .claude/.state/inventory.md returns a wrong path, in cloud sessions where no language server runs, or when the user asks "where is X defined" and the LSP doesn't answer.
metadata:
  version: 1.0.0
  kind: scanner
---

# Scan inventory

The inventory answers "where is OrderService?" with a path instead of a plausible guess. When the
Roslyn language server runs, ask it first: it is live. The inventory is the fallback and works
offline and in cloud sessions.

## Steps

1. Regenerate: `kit scan examples` (the cheapest topic; every scan also rewrites the inventory).
2. Look up a symbol with grep, never by reading the whole file:
   `grep -n "OrderService" .claude/.state/inventory.md`
   Columns: kind, name, project, file:line.
3. If the symbol isn't there, it doesn't exist under that name. Say so rather than guessing a
   path, then search the source for similar names.

## Why it's gitignored

It changes with almost every commit, so committing it would put it in every pull request and
every merge conflict. Each developer and session regenerates it locally in about a second.
