# .NET AI kit marketplace

This repository is a Claude Code plugin marketplace. You are maintaining the kit, not using it.

## Rules

- Every fact lives in exactly one place. Anything derivable (contract copies, the lock, the
  inventory below) is build output: never edit it by hand, run `npm run sync`.
- After any edit under `packs/`: `npm run sync`, then `npm run verify`. Use the `repo-sync` skill.
- Content changed ⇒ bump its version: a contract's `version`, a skill's `metadata.version`, and
  the pack's `plugin.json` version (Claude Code caches plugins by version; without a bump users
  keep the old copy).
- No C#, ASP.NET Core or EF Core tutorial content in skills or contracts. Framework knowledge
  belongs to the official layer: the dotnet-agent-skills plugins (`dotnet`, `dotnet-data`,
  `dotnet-aspnetcore`, `dotnet-upgrade`) and the Microsoft Learn MCP. A skill holds a loop; a
  contract holds a failure class and a diagnostic method.
- kit-core-dotnet stays stack-independent: it names no official skill and no stack tool; it reads them
  from the generated router of the project.
- New contract: `npm run new -- contract <name> --pack <pack>`, then the `contract-author` skill.
  Only from a real incident.
- A new skill of the official layer that kit files name goes into `EXTERNAL_SKILLS` in
  `tools/kit.mjs`, or verify (I4) fails.
- Model-facing files (skills, contracts, commands) are in English. User docs (README, TODO) are
  in Hungarian.

## Layout

- `packs/kit-core-dotnet/`: stack-independent skills and core contracts, `methodology.md`
- `packs/kit-dotnet/`: .NET contracts (+ synced copies of the core ones), skills, commands,
  `tools/` (the project-side `kit-dotnet` CLI and its scanners), `bin/kit`, the Stop hook, MCP config
- `tools/kit.mjs`: marketplace CLI (sync, verify, new)
- `templates/project-ci.yml`: the conventions freshness check for application repos

<!-- kit:generated:start · written by `npm run sync`, do not edit below -->

## Inventory

### Plugins (2)

| plugin | version |
| --- | --- |
| kit-core-dotnet | 1.1.0 |
| kit-dotnet | 1.1.0 |

### Contracts (12)

| contract | pack | version | status | applies when |
| --- | --- | --- | --- | --- |
| emit-hygiene | kit-core-dotnet | 1.1.0 | candidate | writing any code |
| lifetime-matched-injection | kit-core-dotnet | 1.1.0 | candidate | registering a service, a singleton or cache, background work, subscriptions, timers, event handlers |
| logic-over-surface | kit-core-dotnet | 1.1.0 | candidate | writing or reviewing a rule, contract, convention or skill |
| openapi-client-consumption | kit-core-dotnet | 1.1.0 | candidate | touching a generated API client or the data it returns |
| self-descriptive-naming | kit-core-dotnet | 1.1.0 | candidate | naming anything (file, project, namespace, class, method, property, variable, route) |
| api-spec-fidelity | kit-dotnet | 1.0.0 | candidate | endpoint, controller action, DTO, enum, JSON options, OpenAPI document |
| commit-side-effect-order | kit-dotnet | 1.0.0 | candidate | SaveChanges, transaction, multi-step write or delete, e-mail, message queue, HTTP call, file write, retry, background work |
| dotnet-tooling | kit-dotnet | 1.1.0 | candidate | using, or failing to reach, the SDK, dotnet-ef, the Roslyn language server, the Microsoft Learn or NuGet MCP server, or an official dotnet skill |
| lost-update | kit-dotnet | 1.0.0 | candidate | update endpoint or command, edit form, PUT/PATCH, toggle, stock or counter change, background job writing the same rows |
| migration-history | kit-dotnet | 1.0.0 | candidate | migration, ModelSnapshot, entity or model configuration change, schema script, merge of branches that touched the model |
| nullability-across-layers | kit-dotnet | 1.0.0 | candidate | new or changed field, nullable or required, database column, DTO, mapping, view model |
| time-kind | kit-dotnet | 1.0.0 | candidate | DateTime, DateTimeOffset, DateOnly, TimeOnly, a date stored as text, time zone, dates in JSON or in a query |

### Skills (11)

| skill | pack | version | kind |
| --- | --- | --- | --- |
| code-review | kit-core-dotnet | 1.1.0 | verify |
| codecraft | kit-core-dotnet | 1.1.0 | verify |
| contract-author | kit-core-dotnet | 1.1.0 | author |
| convention-creator | kit-core-dotnet | 1.1.0 | author |
| error-classifier | kit-core-dotnet | 1.1.0 | router |
| repo-sync | kit-core-dotnet | 1.1.0 | maintenance |
| setup | kit-core-dotnet | 1.1.0 | scanner |
| scan-examples | kit-dotnet | 1.1.0 | scanner |
| scan-inventory | kit-dotnet | 1.1.0 | scanner |
| scan-package | kit-dotnet | 1.1.0 | scanner |
| scan-project | kit-dotnet | 1.1.0 | scanner |

### Commands (6)

| command | pack | description |
| --- | --- | --- |
| /db-scaffold | kit-dotnet | Re-scaffold the EF Core model from the database in a database-first repo without losing hand-written code |
| /dotnet-upgrade | kit-dotnet | Upgrade the solution one .NET major version (TFM, SDK, Microsoft packages together) with the official migration skill, then re-scan and check |
| /ef-migration | kit-dotnet | Add an EF Core migration the way this repo does it, review it for data loss, and check nothing is left pending |
| /integration-test-setup | kit-dotnet | Set up integration tests (WebApplicationFactory for web apps, a real test database matching the production provider) with one passing smoke test |
| /openapi-export | kit-dotnet | Regenerate the committed OpenAPI document from the code and list the breaking changes for the clients |
| /package-add | kit-dotnet | Add a NuGet package the way this repo manages packages, with a version checked for compatibility and known vulnerabilities |

<!-- kit:generated:end -->
