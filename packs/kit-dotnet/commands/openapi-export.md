---
description: Regenerate the committed OpenAPI document from the code and list the breaking changes for the clients
argument-hint: "[output path, optional]"
---

# openapi-export

## When

An endpoint, a DTO, an enum or the JSON options changed in an ASP.NET Core project, or a client
reported that the spec and the real response disagree.

## Steps

1. Read `.claude/conventions/api.md` for the OpenAPI generator and the committed spec file. If
   there is no generator, stop and say so: the API has no published contract yet.
2. Read `kit-dotnet contract api-spec-fidelity`.
3. Regenerate the document the way the repo does it: build-time generation
   (`Microsoft.Extensions.ApiDescription.Server`, `dotnet build`), the Swashbuckle or NSwag CLI, or
   fetching the running app's document endpoint. Write it to the committed path (or `$ARGUMENTS`).
4. Diff it against the previous version and classify every change: added (safe), removed or
   renamed (breaking), required/nullable changed (breaking for one side), enum values changed.
5. For every breaking change, name the consumer that has to follow (frontend client
   regeneration, mobile app). In a frontend repo with the kit installed, that is its client
   regeneration command.
6. `kit-dotnet scan api` and review the diff.

## Verify

- Build and tests pass.
- The committed document equals what the code generates now.
- The pull request lists the breaking changes, or says there are none.

## Rollback

`git checkout -- <spec file>` restores the previous document; revert the code change that caused
the difference separately.
