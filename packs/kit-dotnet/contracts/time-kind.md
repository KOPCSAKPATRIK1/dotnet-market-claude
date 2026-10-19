---
name: time-kind
version: 1.0.0
kind: contract
pack: kit-dotnet
status: candidate
incident: none yet
applies-when: DateTime, DateTimeOffset, DateOnly, TimeOnly, a date stored as text, time zone, dates in JSON or in a query
---

# Time kind

## Failure class

A time value loses which kind of time it is: an instant (a moment, the same everywhere), a
calendar date (a day, no time zone), or a local wall-clock time (a time in a named zone). It shows
up as an hour or a day of drift that appears only in some time zones, around daylight-saving
changes, after a server moves, or when a date stored as text is sorted or compared as text.

## How to diagnose

For every time field in the diff, name its kind first. Then check that the C# type
(`DateTimeOffset` or UTC `DateTime` for instants, `DateOnly` for dates), the column type and the
JSON format fit that kind in every layer, and that no layer converts it implicitly
(`DateTime.Now` on a server, `ToLocalTime`, `DateTimeKind.Unspecified` from the database, a date
parsed from a string with the current culture).

## What to do

- Instants: `DateTimeOffset` (or `DateTime` in UTC, consistently) and `DateTime.UtcNow` or an
  injected `TimeProvider`.
- Calendar dates: `DateOnly` and a date column; no time component.
- Never store a date as free text; if a legacy column is text, parse and format it in one place
  with an invariant format.
- Inject `TimeProvider` where tests need a fixed time.
