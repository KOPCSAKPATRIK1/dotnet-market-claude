---
name: contract-author
description: Turns a real incident into a contract - a rule that names a failure class and a diagnostic method, not a specific API or fix. Use this after a bug that "bit us again", after a post-mortem, or when the user says "we should have a rule for this", "make sure this never happens again", "add a contract", or wants to write a team rule. Rejects drafts that only describe the surface, and drafts the official documentation already covers.
metadata:
  version: 1.1.0
  kind: author
---

# Contract author

A contract is worth more than any other file in the kit because no model can infer it. It is
also the easiest thing to get wrong: a rule that names the incident's API works today and
silently stops covering the next instance. Your job is to force the generalisation before the
rule is written, because nobody generalises a rule later once it sounds right.

Read the meta-rule first: `kit-dotnet contract logic-over-surface`.

## 1. Ask four questions, one at a time

1. **What broke, concretely?** (the incident: what the user saw, where)
2. **What is the root cause, not the symptom?**
3. **What is the failure class?** All situations where the same cause produces the same harm.
4. **What is the diagnostic method?** How someone who never saw this incident finds the next one.

Push back on answers that stay concrete. "Call SaveChanges before sending the e-mail" is a
symptom; "an external effect that happens before, or independently of, the commit it depends on
survives a rollback" is a class.

## 2. Filter

Reject (and say why) when:

- the compiler, an analyzer, the build or the linter already catches it, so add an analyzer or
  lint rule instead;
- the official docs already state it (check the official skills and documentation search listed
  in the router's **Tools** section), so it's framework knowledge, not a contract;
- it is true only in this repo, so it's a decision: append it to `.claude/decisions/traps.md`.

## 3. Write the draft

Contracts live in the marketplace repository, not in projects. In the marketplace repo run
`npm run new -- contract <name> --pack <kit-core-dotnet|stack pack>` and fill the skeleton. A failure
class that holds for every stack goes to kit-core-dotnet. From a project, write the draft into the chat
and tell the user where it goes.

Frontmatter: `name`, `version: 1.0.0`, `kind: contract`, `pack`, `status: confirmed`,
`incident:` (one line naming it), `applies-when:` (the trigger the router shows). Sections:
**Failure class**, **How to diagnose**, **What to do**.

## 4. Scope

`applies-when` decides when sessions read it: too broad is noise every task, too narrow is a dead
rule. Agree it with the user.

## 5. Hand off to the machine

In the marketplace repo: `npm run sync` (copies, lock, CLAUDE.md inventory), then
`npm run verify`, then commit and push. CI runs verify again.
