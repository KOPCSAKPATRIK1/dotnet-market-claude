---
name: lifetime-matched-injection
version: 1.0.0
kind: contract
pack: kit-core
status: candidate
incident: none yet
applies-when: registering a service, a singleton or cache, background work, subscriptions, timers, event handlers
---

# Lifetime-matched injection

## Failure class

A value lives longer or shorter than the thing it describes. A singleton holds state for one
request, one user or one page and leaks it into the next; a unit of work (a database context, a
transaction) is shared by callers that should each have their own; background work outlives the
scope that created its dependencies; a subscription, timer or event handler outlives its owner.
Nothing fails at once: the bug appears under concurrency, after a logout, or after hours of use.

## How to diagnose

For every registration and every long-lived reference, name two lifetimes: the holder's
(process, scope/request, page, dialog) and the data's (app, user session, request, single
operation). They must be equal. Then check that every subscription, listener and timer has an
owner that ends it, and that nothing resolves a short-lived service from a long-lived container.

## What to do

- Scope the holder to the data's lifetime, or reset the state at the lifetime's boundary
  (for example on logout).
- **.NET**: a scoped service (a `DbContext`, anything per-request) is never captured by a
  singleton, a static field or a `BackgroundService`; create a scope (`IServiceScopeFactory`) or
  use `IDbContextFactory<T>` per operation. Resolving services from the root provider
  (`host.Services.GetService`, a static service locator) turns every scoped service into a
  process-wide singleton: in a desktop app, create a scope per page or per operation instead.
  Don't keep `HttpContext` beyond the request; copy the values you need.
- **Angular / front ends**: scope providers to the route or component that owns the data, and
  tie subscriptions to an owner (`takeUntilDestroyed`, `DestroyRef`, the async pipe).
