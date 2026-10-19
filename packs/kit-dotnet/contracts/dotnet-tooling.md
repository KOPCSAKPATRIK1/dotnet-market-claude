---
name: dotnet-tooling
version: 1.1.0
kind: contract
pack: kit-dotnet
status: candidate
incident: none yet
applies-when: using, or failing to reach, the SDK, dotnet-ef, the Roslyn language server, the Microsoft Learn or NuGet MCP server, or an official dotnet skill
---

# .NET tooling and fallbacks

## Failure class

A session silently degrades: the SDK pinned by `global.json` isn't installed, `dotnet dnx` is
missing (it needs the .NET 10 SDK), so the Roslyn language server and the NuGet MCP server never
start; `dotnet-ef` is absent or a different major than the project's EF Core; a Windows-only
project (WinUI, WPF, WinForms) can't be built on the current machine. The work continues from
memory and looks identical to a normal run, so nobody knows the checks didn't happen.

## How to diagnose

At the first framework question, symbol lookup, build or migration, notice which tool actually
answered. `kit-dotnet status` lists every tool and its fallback.

## What to do

- Framework question: the official skills (see the router's **Tools** section) and the Microsoft
  Learn MCP first; memory last.
- Symbol: LSP; fallback: grep `.claude/.state/inventory.md`.
- Build: the build command in workspace.md. If the project can't be built here (Windows-only
  target on Linux or macOS), say so, build the platform-independent projects, and list the rest
  as not checkable.
- When a tool doesn't answer: say so once ("NuGet MCP not available, checked versions with
  `dotnet list package --outdated`"), use the fallback, and list it in the final report.
