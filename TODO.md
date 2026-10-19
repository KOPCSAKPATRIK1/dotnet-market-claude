# TODO

✅ kész · ⬜ nyitott · 👤 a te döntésed vagy gépeden futó lépés

## Mechanizmus

- ✅ Marketplace CLI (`sync`, `sync --check`, `verify`, `new`), stack-packonkénti core-másolatokkal és külső skill-listával
- ✅ Invariánsok I1–I6 a `verify`-ban (I6 a manifesteket is nézi: listázott plugin, feloldható függőség), I7 a CI-ban
- ✅ Hivatalos réteg közvetlen függőségként: `dotnet`, `dotnet-data`, `dotnet-aspnetcore`, `dotnet-upgrade` a `dotnet-agent-skills` marketplace-ből, `allowCrossMarketplaceDependenciesOn`
- ✅ MCP: Microsoft Learn (távoli HTTP), NuGet (`dotnet dnx NuGet.Mcp.Server`, a csomag a nuget.org-on ellenőrizve)
- ✅ kit-core-dotnet leválasztva az Angularról: a skillek a generált router „Tools” és „Failure classes” részéből olvassák a hivatalos réteget
- ✅ `lifetime-matched-injection` a kit-core-ban, stackenkénti „What to do” résszel
- ✅ .NET scannerek: workspace, architecture, data, api, di, ui, validation, mapping, style, testing, lint, examples; inventory és belső NuGet-csomagok
- ✅ A jelölt contractok: `api-spec-fidelity`, `nullability-across-layers`, `migration-history`, `commit-side-effect-order`, `time-kind`, `lost-update`, `dotnet-tooling`
- ✅ Commandok When / Steps / Verify / Rollback szakaszokkal
- ✅ Stop hook (`.cs`, `.razor`, `.cshtml`, `.xaml`, `.csproj`, `.props`, `.targets`, `.sql` diff)
- ✅ `claude plugin validate`: mindkét plugin és a marketplace manifest átmegy
- ✅ Kipróbálva egy valódi .NET repón (Vizsgaremek / webshop-desktop: WinUI 3 + EF Core + MySQL, database-first): init, scan, stale, status, contract, evidence, hook

## Azonnal

- ⬜ 👤 **Telepítési próba** a két marketplace-szel: `/plugin marketplace add dotnet/skills`, `/plugin marketplace add KOPCSAKPATRIK1/dotnet-market-claude`, `/plugin install kit-dotnet@dotnet-ai-kit`, majd a `/plugin` Errors fül és a `/mcp` lista.
- ⬜ 👤 **`claude plugin validate`** mindkét packra.
- ⬜ 👤 `.NET 10 SDK` a gépen (a `dotnet dnx` miatt), `dotnet-ef` globálisan.
- ⬜ 👤 `npm run hooks` a marketplace klónjában (pre-push verify).
- ⬜ 👤 Licenc kiválasztása a repóhoz.

## Contractok valódi incidensekből

- ⬜ Minden contract `status: candidate`. Egy valódi incidens erősítse meg (`incident:` sor, `status: confirmed`), vagy kerüljön ki. A webshop-desktop scanje már három jelöltre mutatott példát: `commit-side-effect-order` (a repository minden írásnál `SaveChanges`-t hív), `time-kind` (`Release.ReleaseDate` szövegként), `lifetime-matched-injection` (scoped DbContext a gyökér-providerből).
- ⬜ Mérőszám: legyen legalább egy új contract negyedévente. Ha ez nulla, a rendszer üres doboz.
- ⬜ Az `error-classifier` .NET-sorai a routerben: bővítsd, amikor egy valódi hiba nem illik egyik sorba sem.

## Később

- ⬜ Külön frontend- és backend-repónál a `/openapi-export` → a frontend klienst újrageneráló parancsának átadása leírva.
- ⬜ Verziókorlát a `dotnet-*` függőségekre, ha a dotnet/skills pluginonként tagel.
- ⬜ Pontosabb (Roslyn-alapú) scannerek, ha a regex-alapú heurisztika téved. A tévedés első jele: a `convention-creator` furcsa kérdést tesz fel.
- ⬜ Skill-evalok a skill-creatorral (tesztpromptok, baseline-összevetés, a leírások optimalizálása).
