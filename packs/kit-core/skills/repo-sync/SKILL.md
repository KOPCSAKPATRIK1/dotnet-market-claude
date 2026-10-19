---
name: repo-sync
description: Maintains the kit marketplace repository itself - derives every generated file (contract copies, registry.lock.json, the generated part of CLAUDE.md) in one pass, then verifies the invariants. Use this after any edit inside the kit marketplace repo (a contract, skill, command or scanner changed), before pushing it, or when its CI verify job fails. Never use it inside an application repository.
metadata:
  version: 1.0.0
  kind: maintenance
---

# Repo sync

The classic failure is one audit fixing something that invalidates another, so everything has to
be run three times. The fix is that nothing writes back into a source file: every derived file is
written in one pass from the sources, and the second run is a no-op.

## Is this the marketplace repo?

Only if `.claude-plugin/marketplace.json` and `tools/kit.mjs` exist at the repo root. Otherwise
stop and say this skill is for the marketplace only.

## Steps

1. `npm run sync`: writes contract copies, `registry.lock.json`, the generated block of
   `CLAUDE.md`.
2. `npm run verify`: checks the invariants:
   - I1 the lock regenerates byte-identically
   - I2 content changed ⇒ version bumped (against the base branch)
   - I3 every contract copy equals its source
   - I4 closed world: every referenced contract, skill and command exists
   - I5 counts appear only in generated files
   - I6 shape: commands have When / Steps / Verify / Rollback; skills and contracts have valid
     frontmatter; every plugin is listed and every dependency resolves
3. Run `npm run sync` again and confirm `git status` shows no new change (I7, idempotence).

## When verify fails

- **I2**: decide with the user whether the change is a patch (wording) or breaking (behaviour),
  bump `version` in that file's frontmatter and the pack's `plugin.json`, sync again.
- **I3**: someone edited a copy; edit the source in `packs/kit-core/contracts/` instead.
- **I4**: a name is misspelled or the target was removed; fix the reference. A new skill of the
  official layer goes into `EXTERNAL_SKILLS` in `tools/kit.mjs`.
- Anything else: show the message and the file; don't silence the check.
