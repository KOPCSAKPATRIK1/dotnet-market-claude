---
name: codecraft
description: The end-of-task check loop for code changes - looks up every convention, decision and contract the diff touches, runs the build and tests, checks the diff against each rule, fixes what it can, and reports what it applied, what it skipped and what it could not check. Use this at the end of every coding task before saying the work is done, whenever the kit's Stop hook asks for it, and whenever the user asks to "check against the conventions", "make sure this follows our rules", or "verify the change". Contains no framework knowledge; framework questions go to the official layer named in the router.
metadata:
  version: 1.0.0
  kind: verify
---

# Codecraft

Models don't naturally re-check their own diff against a named list of rules. This skill is that
loop, and nothing else. It teaches no framework: for framework questions use the official layer
listed in the **Tools** section of `.claude/conventions/_router.md` (official skills, MCP
documentation search).

## 1. Collect the diff

`git diff HEAD` plus untracked files (`git status --short`). Note which areas it touches, using
the topics of the router's conventions table (for example: entities and migrations, endpoints,
services and registrations, view models, tests, configuration).

## 2. Look up the rules for those areas

- The router (`.claude/conventions/_router.md`, imported from CLAUDE.md) says which convention
  file covers each area. Read those files.
- Read `.claude/decisions/conventions.md` and `.claude/decisions/traps.md`. Decisions win over
  generated conventions.
- For each contract whose "applies when" matches the diff, read it with `kit contract <name>`.
  Always include `emit-hygiene` and `self-descriptive-naming`.
- If `.claude/conventions/` doesn't exist, say so once, check against the official layer only, and
  suggest the `setup` skill.

## 3. Run the checks

- The build command from workspace.md.
- The test command, when tests exist for the touched code or you added some.
- Every extra check the router's **Tools** section lists for the touched area (for example a
  pending-model-changes check after an entity change).
- Language-server diagnostics on changed files when available.

## 4. Check the diff against each rule

Go rule by rule, not file by file, so nothing is skipped because it seemed unrelated. For each
rule decide: followed, violated (fix it now), deliberately not followed (keep a one-line reason),
or not checkable (say why).

When a convention and the official best practice disagree, the convention wins in this repo;
say which one you followed.

## 5. Report and record

Use this shape:

```
Applied:        rule → where
Fixed:          rule → what changed
Deviations:     rule → why it's right here
Not checkable:  rule → why (no tests, tool missing, needs a database…)
Fallbacks:      tool that didn't answer → what was used instead
Build/tests:    command → result
```

Then run `kit codecraft-done` so the Stop hook knows this diff was checked. If you change code
after that, run the loop again for the new part.
