# .NET AI Kit

Claude Code marketplace .NET projektekhez (ASP.NET Core, EF Core, asztali alkalmazások).
**Csak azt írja le, amit Claude nem tud kitalálni:** a repód tényeit (generált *conventionök*) és a
csapatod döntéseit (kézzel írt *contractok*). C#-ot, ASP.NET Core-t és EF Core-t nem tanít: azt a
.NET csapat hivatalos rétege adja (a `dotnet-agent-skills` marketplace pluginjai, a Roslyn
language server, a Microsoft Learn MCP).

## Mi van benne

| Plugin | Mit ad |
| --- | --- |
| `kit-core` | A hurok (`codecraft`, `code-review`), szerzői skillek (`contract-author`, `convention-creator`), `setup`, `error-classifier`, `repo-sync`, a stack-független core contractok |
| `kit-dotnet` | Ezt telepíted. Scannerek és a `kit` parancs, .NET contractok, commandok (`/ef-migration`, `/db-scaffold`, `/openapi-export`, `/dotnet-upgrade`, `/package-add`, `/integration-test-setup`), Stop hook, Microsoft Learn és NuGet MCP. Függőségként hozza a `kit-core`-t és a .NET csapat `dotnet`, `dotnet-data`, `dotnet-aspnetcore`, `dotnet-upgrade` pluginját |

A pontos, mindig friss leltár a [CLAUDE.md](CLAUDE.md) generált részében van.

Ajánlott, de nem függőség (a `dotnet-agent-skills` marketplace-ből): `dotnet-test`, `dotnet-nuget`,
`dotnet-diag`, `dotnet-msbuild`. A `claude-plugins-official` `csharp-lsp` pluginját **ne**
kapcsold be mellé: ugyanazokért a fájlokért felel, mint a `dotnet` plugin Roslyn szervere.

## Telepítés

Előfeltételek (egyszer, gépenként):

```bash
dotnet --version                     # 10.0 vagy újabb: a Roslyn LSP és a NuGet MCP `dotnet dnx`-szel indul
node --version                       # 20 vagy újabb: a kit CLI és a Stop hook Node-on fut
dotnet tool install --global dotnet-ef
```

Claude Code-ban:

```
/plugin marketplace add dotnet/skills
/plugin marketplace add KOPCSAKPATRIK1/dotnet-market-claude
/plugin install kit-dotnet@dotnet-ai-kit
/reload-plugins
```

Ellenőrzés: a `/plugin` Errors fülén nincs hiba, a `/mcp` listában ott van a `microsoft-learn` és a
`nuget`, a `kit status` pedig mindent elérhetőnek mutat.

> A `dotnet/skills` marketplace-t a kit előtt kell hozzáadni, különben a négy `dotnet-*`
> függőség nem települ, és a kit-dotnet nem tölt be.

Windowson nincs szükség `cmd /c` előtagra: a helyi MCP szerverek a `dotnet` paranccsal indulnak,
a Microsoft Learn MCP pedig távoli HTTP szerver.

## Első használat egy projektben

Nyisd meg a projektet a git rootból, és kérd: **„állítsd be a kitet”**. A `setup` skill:

1. lefuttatja a `kit status`-t,
2. `kit init`: létrehozza a `.claude/decisions/`, `.claude/kit.json` fájlokat, a `.gitattributes`
   és `.gitignore` sorokat, és a CLAUDE.md-be beírja a router importját,
3. `kit scan`: legenerálja a `.claude/conventions/*.md` fájlokat a solutionből (a scannerekhez nem
   kell SDK és build, szövegként olvassák a projektfájlokat és a C# forrást),
4. felajánlja a `convention-creator`-t, ami pár kérdéssel szabállyá teszi a tényeket. Több
   DbContextnél mindig visszakérdezi, melyik projektpár tartozik össze.

Utána commitold a `.claude/` mappát (a `.claude/.state/` gitignored).

## Napi használat

- Csak dolgozz. A session a routerből tudja, mit kell elolvasnia.
- Feladat végén a `codecraft` lefut (`dotnet build`, `dotnet test`, a diff a szabályok ellen). Ha
  elmaradna, a Stop hook kéri. Kikapcsolás: `.claude/kit.json` → `"enforceCodecraft": false`.
- Hiba esetén: „mi ez a hiba?” → `error-classifier`.
- PR előtt: „nézd át a változásaimat” → `code-review`.
- Változott a modell: `/ef-migration AddOrderNote` (code-first) vagy `/db-scaffold` (database-first).
- Változott egy végpont: `/openapi-export`.
- Ha valami megint megharapott: „írjunk erre contractot” → `contract-author`.

```bash
kit status          # mi van beállítva, mi elavult, mely eszközök érhetők el
kit stale           # mely conventionök nem egyeznek már a kóddal
kit scan            # újragenerálás
kit contract        # contractok listája; kit contract <név> kiírja
kit evidence style  # a nyers számok egy témához (a convention-creator kérdéseihez)
```

A projekt CI-ába másold be a [templates/project-ci.yml](templates/project-ci.yml)-t: a PR elbukik,
ha egy commitolt convention már nem egyezik a kóddal.

## A marketplace karbantartása

```bash
npm run hooks       # egyszer: pre-push hook (piros verify nem pusholható)
npm run sync        # minden származtatott fájl egy menetben
npm run verify      # invariánsok I1–I6; a CI az I7-et is nézi
npm run new -- contract <név> --pack kit-dotnet
```

Szabály: ha egy fájl tartalma változik, emeld a verzióját (contract `version`, skill
`metadata.version`), és a pack `plugin.json` verzióját is. A Claude Code verzió szerint
cache-el, verzióemelés nélkül a felhasználók a régi példányt kapják.

## Eltérések az Angular kittől és a tervtől

| Terv / Angular kit | Itt | Miért |
| --- | --- | --- |
| `angular-official` wrapper, rögzített upstream commit | Közvetlen függőség a `dotnet-agent-skills` pluginjaira | A .NET csapat eleve Claude Code marketplace-ként adja ki; egy wrapper elvesztené a Roslyn LSP beállítást és az agenteket (1. döntés) |
| `kit` CLI a kit-core-ban | A `kit` a kit-dotnet-ben marad | Ebben a marketplace-ben egy stack van, így nincs két `bin/kit` a PATH-on; a marketplace CLI már stack-packonként kezeli a core-másolatokat, ha jönne egy második (2. döntés) |
| `lifetime-matched-injection` a stack-packban | A kit-core-ban, stackenkénti „What to do” résszel | A hibaosztály stack-független (3. döntés) |
| A kit-core név szerint hivatkozik a hivatalos rétegre | A generált `_router.md` „Tools” és „Failure classes” része adja | Így a kit-core egy második stackkel is változtatás nélkül működik |
| Scanner-témák a tervből | Plusz `ui` és `style` téma | Asztali (WinUI/WPF/MAUI) repóknál a view model minták, és minden repónál a megfigyelt kódstílus a leggyakoribb kérdés |

A teendők listája: [TODO.md](TODO.md).
