---
name: logic-over-surface
version: 1.0.0
kind: contract
pack: kit-core
status: candidate
incident: none yet (meta-rule from the kit's design)
applies-when: writing or reviewing a rule, contract, convention or skill
---

# Logic over surface

## Failure class

A rule names a concrete API, class name or fix value instead of the failure behind it. It works
today, then silently stops covering the bug the moment the same failure arrives through a
different API ("don't push() into a signal's array" misses the same bug through an object field
or an input).

## How to diagnose

For a draft rule, answer four questions:

1. **What broke, concretely?** The incident.
2. **What is the root cause, not the symptom?**
3. **What is the failure class?** Every situation where the same root cause produces the same harm.
4. **What is the diagnostic method?** How someone who doesn't know the incident finds the next
   instance.

If the rule's text only makes sense with the incident's class or method names in it, it is
still describing the surface.

## What to do

- Write the class and the method. Concrete names may appear only as one example, marked as such.
- Reject a rule that the compiler, the linter or the build already enforces: it isn't needed.
- Reject a rule the official documentation of the stack already states: that's framework knowledge.
