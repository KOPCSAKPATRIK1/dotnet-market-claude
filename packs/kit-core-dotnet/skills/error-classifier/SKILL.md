---
name: error-classifier
description: Classifies a failure - build error, test failure, runtime exception, stack trace, failing migration, wrong data on screen, failing dev server - into a failure class and routes it to the matching contract, convention or command before any fix is attempted. Use this whenever something fails and the cause isn't obvious, when the user pastes an error or stack trace, or says "it's broken", "the build fails", "this test is red", "the data is wrong", or "nothing updates".
metadata:
  version: 1.1.0
  kind: router
---

# Error classifier

Fixing the first plausible cause of an error often fixes a symptom. Classify first, then use the
contract for that class to find the real cause. This skill routes; it doesn't teach fixes.

## 1. Gather

The full error text, the command or action that produced it, and what changed recently
(`git diff HEAD`, recent commits). Use LSP diagnostics for the files involved. For an error code
or exception type you don't know, ask the documentation search listed in the router's
**Tools** section.

## 2. Classify

Use the stack's table first: the **Failure classes** section of `.claude/conventions/_router.md`
maps the stack's exceptions and signals to contracts and commands. When nothing there fits, use
the generic classes:

| Class | Typical signals | Route to |
| --- | --- | --- |
| Type / compile | compiler errors, missing reference | LSP diagnostics; fix directly |
| Injection / lifetime | service not registered, state leaking between users or pages, memory growth | `lifetime-matched-injection` |
| API data | null or missing fields, wrong shape from the server | `openapi-client-consumption`, api.md |
| Naming / readability | a reviewer can't tell what a symbol holds | `self-descriptive-naming` |
| Tooling / environment | MCP or LSP not starting, missing SDK or tool | `setup` skill |
| Test setup | test fails before reaching the code under test | testing.md |

Read the routed contract with `kit-dotnet contract <name>`.

## 3. Report

```
Class: …   (confidence: high/medium/low, and the signal that decided it)
Contract / convention: …
Diagnostic method from it: …
Next step: …
```

If two classes fit, say so and name the observation that would tell them apart.
