# Methodology: building a pack for a new stack

The kit is a method, not a product for one framework. A new stack (React, Spring, Angular…) gets
new scanners and a new contract folder, not a new architecture.

## The one question

For every piece of knowledge ask: **who can produce it?**

| Producer | Layer | Treatment |
| --- | --- | --- |
| The model already knows it | framework knowledge | don't write it; point to the official skill/MCP/docs |
| A script can read it from the repo | convention | generate it, commit it, never hand-edit |
| Only a person who got burned | contract or decision | write it by hand, version it |

Entry test for a rule: its violation is invisible to the compiler and the linter, and it's
expensive. Everything else is already covered by the model, the build and code review.

## What a stack pack contains

1. **Official layer as dependencies**: the stack's official skills, its MCP servers, its language
   server plugin. Depend on them directly when the vendor publishes a marketplace (the .NET team
   does: `dotnet-agent-skills`); wrap them only when it doesn't. Never copy their content.
2. **Scanners**: one deterministic function per topic → one small file. Rules for every output:
   - deterministic: same code ⇒ byte-identical file (no dates, no counts that drift)
   - one fact per line, stable order
   - a provenance comment naming the inputs
   - raw counts go to a gitignored evidence file, for the convention-creator to ask about
3. **Contracts** specific to the stack, written from incidents (see `logic-over-surface`).
   A failure class that holds for every stack goes to kit-core instead, with one "What to do"
   paragraph per stack.
4. **Commands** for sequences an experienced developer could get wrong without noticing. Each has
   When, Steps, Verify, Rollback.
5. **A `kit` CLI** on the plugin's `bin/` path: `init`, `scan`, `stale`, `status`, `contract`,
   `evidence`, `codecraft-done`, `hook-stop`. Copy the shape of `packs/kit-dotnet/tools/`.
6. **A generated router** that names the stack's official layer, its tools and its failure-class
   rows. kit-core skills read the official layer from the router, never by name.
7. **A Stop hook** that asks for the codecraft loop when the code diff changed since the last
   check.

## Project layout the pack produces

```
<git root>/.claude/
  CLAUDE.md               hand-written, imports conventions/_router.md
  conventions/            generated, committed, merge=binary (regenerate on conflict)
    _router.md            the map: which file when, contracts table, priority, tools
    <topic>.md            one per scanner
    packages/<pkg>.md     internal packages, version header
  decisions/              hand-written, normal merge
    conventions.md        confirmed rules + exceptions (convention-creator)
    traps.md              non-obvious decisions
    adr/
  .state/                 gitignored: inventory.md, evidence.json, codecraft.json
  kit.json                packages to scan, codecraft enforcement switch
```

## Priority on conflict

contract > decision > convention > official best practice > the model's own knowledge.
A session always states a conflict; it never resolves one silently.

## Health metric

New contracts per quarter. If it's zero for two quarters, the mechanism is serving an empty box,
however green verify is.
