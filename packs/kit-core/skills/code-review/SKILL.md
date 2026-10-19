---
name: code-review
description: Reviews a diff, branch or pull request against the team's contracts, decisions and repo conventions, using the language server to find every caller the change affects. Use this before declaring a feature done, when the user asks for a review of their changes, a branch or a PR, or asks "is this ready to merge", "anything wrong with this", or "check my changes". Findings point to contracts and conventions rather than personal taste.
metadata:
  version: 1.0.0
  kind: verify
---

# Code review

A review here is a check against written rules plus a search for what the change breaks
elsewhere. Personal style preferences aren't findings.

## Steps

1. **Scope.** Get the diff: the working tree, `git diff <base>...HEAD` for a branch, or the PR's
   diff. Summarise in two lines what the change is for.
2. **Rules.** Read the conventions, decisions and contracts that apply (see the router in
   `.claude/conventions/_router.md`; contracts via `kit contract <name>`).
3. **Blast radius.** For every changed public symbol, ask the language server for references
   and the call hierarchy. Without it, grep `.claude/.state/inventory.md` and the source. A changed
   signature, DTO, entity or model field with an unchanged caller is a finding.
4. **Contracts across layers.** If the diff changes a committed contract file (an OpenAPI spec, a
   schema, a migration, a public package API), read its diff as the contract change and check
   every consumer named in the conventions.
5. **Check.** For each rule: violated or not. For each finding record file:line, the rule it
   breaks (contract name, convention file, or decision), and the smallest fix.

## Tightened contracts

A contract with `tightens: true` in its frontmatter turned a recommendation into a requirement.
Old code violating it is backlog, not a defect of this change. Report it in a separate
"Backlog" list, and only flag violations the diff introduced or touched.

## Output

```
Summary: one or two lines
Findings (most severe first):
  [blocker|major|minor] file:line: what's wrong → rule → suggested fix
Backlog (pre-existing, from tightened contracts): …
Not checked: … and why
```

No findings is a valid result; say so plainly.
