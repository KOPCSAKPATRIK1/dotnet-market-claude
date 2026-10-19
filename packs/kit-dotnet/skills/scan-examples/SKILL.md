---
name: scan-examples
description: Picks one real, in-repo example file per kind (entity, entity configuration, DbContext, repository, service, endpoint or controller, view model, DTO, test) by scoring how well each follows the majority patterns, so new code copies the best local example instead of a generic one. Use this before creating a new file of a kind that already exists, after a refactor that changed the typical shape of a file, before running convention-creator, or when the user asks "show me how we usually write a service/endpoint/entity here".
metadata:
  version: 1.1.0
  kind: scanner
---

# Scan examples

A real file from this repo is a better template than any generic .NET example: it already has
the house naming, folder placement, namespace style, comment language and injection style.

## Steps

1. `kit-dotnet scan examples` writes `.claude/conventions/examples.md`: one path per kind.
2. Before creating a new file of a kind, open its example and mirror its structure.
3. If the chosen example is a poor model (legacy, unusual), don't hand-edit the generated file.
   Record the better example in `.claude/decisions/conventions.md` ("Example for services:
   path, not the scanned one, because …").
4. When feeding `convention-creator`, give it the examples together with `kit-dotnet evidence`: they show
   what the majority pattern actually looks like.
