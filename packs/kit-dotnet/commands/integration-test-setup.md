---
description: Set up integration tests (WebApplicationFactory for web apps, a real test database matching the production provider) with one passing smoke test
argument-hint: "[test framework, default: the one testing.md reports, else xUnit]"
---

# integration-test-setup

## When

The repo has no integration tests, or its tests use a database provider that behaves differently
from production (InMemory against SQL Server, MySQL or PostgreSQL).

## Steps

1. Read `.claude/conventions/testing.md` and `data.md`: existing test projects, framework,
   mocking library, the production database provider.
2. Create (or reuse) a test project `<Solution>.IntegrationTests` with the repo's test framework
   (`$ARGUMENTS` if given) and add it to the solution.
3. Database: use the production provider in a container (Testcontainers) or a disposable real
   database. SQLite in-memory is acceptable only when the production provider is SQLite. Don't use
   the EF Core InMemory provider for integration tests: it has no transactions, constraints or
   SQL translation.
4. Web app: a `WebApplicationFactory<Program>` subclass that replaces the connection string and
   applies migrations (or the schema script for database-first) once per test run. Make `Program`
   visible (`public partial class Program;`) if needed. Desktop or library: build the service
   provider the app builds, with the test connection.
5. One smoke test that goes through the real stack: an HTTP call to an endpoint, or a service
   call that reads and writes one row.
6. `kit scan testing` and review the diff.

## Verify

- `dotnet test` passes locally from a clean clone (document the container prerequisite in the
  test project's README if one is needed).
- The test fails when you break the endpoint or the mapping it covers.

## Rollback

Remove the test project from the solution (`dotnet sln remove`) and delete its folder.
