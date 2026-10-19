---
name: convention-creator
description: Turns raw scan results into confirmed repo rules by asking the user about ambiguous evidence instead of treating the majority as the rule. Use this after the first `kit scan`, after a rescan that changed facts, when conventions look contradictory (mixed registration styles, mixed entity configuration, some services bypassing the repository layer), or when the user asks "what are our conventions", "write down how we do things here", or "is this drift or intended".
metadata:
  version: 1.0.0
  kind: author
---

# Convention creator

A scanner sees facts, not intent. If half of the entities are configured with data annotations
and half in `OnModelCreating`, that may be drift, not a rule, and only a person can say so. This
skill is the step between the scan and the rule.

## 1. Observe

Read `.claude/conventions/*.md` and the raw counts with `kit evidence` (or
`kit evidence <topic>`). The evidence lists the files behind each minority.

## 2. Classify by evidence

- Pattern in 3+ places and no competitor → **candidate rule**.
- Pattern in 1–2 places → **local exception**; record where, don't make a rule.
- Two competing patterns, both in 3+ places → **question**. Never average them.

Where the repo's majority differs from the official recommendation (check the official layer
named in the router's **Tools** section), mention it in the question ("every service resolves
from the root provider; the documented pattern is a scope per operation").

## 3. Ask

A short numbered list, at most five questions, each with the evidence and the options
("rule / drift to fix / exception folder"). Example:

```
1. 12 entities are configured in OnModelCreating, 3 with IEntityTypeConfiguration<T>.
   Which is the rule, or are the 3 drift?
2. Every repository write calls SaveChanges itself.
   Intended (no unit of work), or to be fixed?
```

## 4. Write

Append confirmed rules to `.claude/decisions/conventions.md` (hand-owned, survives every scan):

```
## <topic>: <rule in one sentence>
Exceptions: <paths or folders>, <why>
Drift to fix: <paths>  (refactor backlog)
Confirmed: <date> by <who>
```

Leave numbers out: they go stale on the next commit. Never edit the generated files under
`.claude/conventions/`; the next scan overwrites them.

## 5. Promote

If the same rule holds in two or more projects, suggest it as a contract via `contract-author`.
