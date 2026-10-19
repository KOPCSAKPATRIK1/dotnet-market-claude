---
name: commit-side-effect-order
version: 1.0.0
kind: contract
pack: kit-dotnet
status: candidate
incident: none yet
applies-when: SaveChanges, transaction, multi-step write or delete, e-mail, message queue, HTTP call, file write, retry, background work
---

# Commit and side-effect order

## Failure class

One logical operation is committed in several pieces, or an external effect (e-mail, message,
HTTP call, file) happens before or independently of the commit it depends on. When a later piece
fails, or the execution strategy retries, the system is left half-done: orphan rows, a deleted
parent with surviving children, an e-mail about an order that was rolled back, a payment sent
twice.

A common shape: a repository whose every `Add`, `Update` and `Remove` calls `SaveChanges` itself,
so a service that changes three tables issues three independent commits.

## How to diagnose

For every write path in the diff, list the commits it performs and the external effects it
causes, in order. For each one ask: what state is left if the process stops right after it, and
what happens if it runs twice? More than one commit for one user action, or an effect before the
last commit, is a finding.

## What to do

- One user action = one unit of work: change the tracked entities, then call `SaveChanges` once
  (or use an explicit transaction when several contexts or raw SQL are involved).
- Repositories don't commit; the service (or the request) that owns the operation does.
- External effects run after the commit, or through an outbox written in the same transaction.
- Make retried operations idempotent (a key, a state check) when an execution strategy or a queue
  can repeat them.
