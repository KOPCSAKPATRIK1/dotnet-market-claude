// One scanner per topic. Each is a pure function of the repo: same code in, same facts out.
// Facts never contain counts (they would change with every new file); counts go to `evidence`,
// which is written to the gitignored .claude/.state/evidence.json for convention-creator.
// The scanners read text with regular expressions: they are heuristics, not a compiler. When one
// is wrong, the convention-creator's questions are where it shows.
import path from 'node:path';
import { share } from './util.mjs';

// ---------- helpers ----------

function ratio(name, files, total, evidence, minorityFiles) {
  evidence[name] = { count: files.length, total, files: minorityFiles };
  return share(files.length, total);
}

function list(values) {
  const unique = [...new Set(values)].sort();
  return unique.length ? unique.join(', ') : 'none';
}

function present(flag) {
  return flag ? 'yes' : 'no';
}

/** "all" / "most" … for `part`, plus the files outside it, so the minority can be asked about. */
function measure(evidence, key, files, predicate) {
  const hits = files.filter(predicate);
  const misses = files.filter((f) => !predicate(f));
  const minority = hits.length <= misses.length ? hits : misses;
  evidence[key] = { count: hits.length, total: files.length, minorityFiles: minority };
  return share(hits.length, files.length);
}

const TYPE_DECL = /^[ \t]*(?:\[[^\]]*\][ \t]*)*(?:(?:public|internal|private|protected|static|sealed|abstract|partial|readonly|ref|file|unsafe|new)\s+)*(class|interface|record(?:\s+struct|\s+class)?|struct|enum)\s+([A-Z_]\w*)/gm;

export function typeDeclarations(text) {
  return [...text.matchAll(TYPE_DECL)].map((m) => ({ kind: m[1].replace(/\s+/g, ' '), name: m[2], index: m.index + m[0].lastIndexOf(m[2]) }));
}

function namespaceOf(text) {
  return /^\s*namespace\s+([\w.]+)/m.exec(text)?.[1] ?? null;
}

function projectKind(p) {
  if (p.isTest) return 'test';
  if (p.props.UseWinUI === 'true') return 'WinUI app';
  if (p.props.UseWPF === 'true') return 'WPF app';
  if (p.props.UseWindowsForms === 'true') return 'WinForms app';
  if (p.props.UseMaui === 'true') return 'MAUI app';
  if (/Microsoft\.NET\.Sdk\.Web\b/.test(p.sdk)) return 'web';
  if (/BlazorWebAssembly/.test(p.sdk)) return 'Blazor WebAssembly';
  if (/Microsoft\.NET\.Sdk\.Razor/.test(p.sdk)) return 'Razor class library';
  if (/Microsoft\.NET\.Sdk\.Worker/.test(p.sdk)) return 'worker';
  if (/^(Exe|WinExe)$/i.test(p.props.OutputType ?? '')) return 'console app';
  return 'library';
}

function isWindowsOnly(p) {
  return p.frameworks.some((f) => /-windows/.test(f)) || ['UseWinUI', 'UseWPF', 'UseWindowsForms'].some((k) => p.props[k] === 'true');
}

function isWeb(p) {
  return /Microsoft\.NET\.Sdk\.Web\b/.test(p.sdk);
}

function cmd(ctx, text) {
  return ctx.ws === '.' ? text : `cd ${ctx.ws} && ${text}`;
}

/** Projects ordered bottom-up by their references: layer 0 references nothing in the solution. */
function layers(ctx) {
  const byFile = new Map(ctx.projects.map((p) => [p.file, p]));
  const depth = new Map();
  const visit = (p, seen = new Set()) => {
    if (depth.has(p.file)) return depth.get(p.file);
    if (seen.has(p.file)) return 0;
    seen.add(p.file);
    const refs = p.references.map((r) => byFile.get(r)).filter(Boolean);
    const d = refs.length ? 1 + Math.max(...refs.map((r) => visit(r, seen))) : 0;
    depth.set(p.file, d);
    return d;
  };
  ctx.projects.forEach((p) => visit(p));
  return depth;
}

function dbContexts(ctx) {
  const contexts = [];
  for (const file of ctx.codeFiles) {
    const text = ctx.read(file);
    for (const m of text.matchAll(/class\s+(\w+)\s*(?:\([^)]*\))?\s*:\s*(?:[\w.]*\.)?(DbContext|IdentityDbContext(?:<[^>]*>)?|IdentityUserContext(?:<[^>]*>)?|ApiAuthorizationDbContext<[^>]*>)\b/g)) {
      const sets = [...text.matchAll(/DbSet<\s*(\w+)\s*>\s+(\w+)/g)].map((s) => s[1]);
      contexts.push({ name: m[1], file, project: ctx.projectOf(file)?.name ?? '?', sets: [...new Set(sets)].sort() });
    }
  }
  return contexts.sort((a, b) => a.name.localeCompare(b.name) || a.file.localeCompare(b.file));
}

/** Files that declare the entity types of every DbContext. */
function entityFiles(ctx) {
  const names = new Set(dbContexts(ctx).flatMap((c) => c.sets));
  return ctx.codeFiles.filter((f) => typeDeclarations(ctx.read(f)).some((d) => names.has(d.name) && d.kind !== 'interface'));
}

const PROVIDERS = {
  'Microsoft.EntityFrameworkCore.SqlServer': 'SQL Server',
  'Npgsql.EntityFrameworkCore.PostgreSQL': 'PostgreSQL (Npgsql)',
  'Microsoft.EntityFrameworkCore.Sqlite': 'SQLite',
  'MySql.EntityFrameworkCore': 'MySQL (Oracle MySql.EntityFrameworkCore)',
  'Pomelo.EntityFrameworkCore.MySql': 'MySQL (Pomelo)',
  'Oracle.EntityFrameworkCore': 'Oracle',
  'Microsoft.EntityFrameworkCore.Cosmos': 'Cosmos DB',
  'Microsoft.EntityFrameworkCore.InMemory': 'InMemory',
};

// ---------- scanners ----------

const workspace = {
  topic: 'workspace',
  emits: 'solution, SDK pin, projects with kind and target frameworks, compiler settings, package versions, commands',
  inputs: ['*.sln / *.slnx', '**/*.csproj', 'Directory.Build.props', 'Directory.Packages.props', 'global.json', 'packages.lock.json'],
  run(ctx) {
    const evidence = {};
    const facts = [];
    const notes = [];
    facts.push(['solution folder', ctx.ws === '.' ? 'repository root' : `${ctx.ws}/`]);
    facts.push(['solution file', ctx.solution ?? 'none (projects found without a solution)']);
    if (ctx.solutionFiles.length > 1) notes.push(`More than one solution file: ${ctx.solutionFiles.join(', ')}. The scan uses ${ctx.solution}.`);
    const sdk = ctx.globalJson?.sdk;
    facts.push(['SDK pin (global.json)', sdk?.version ? `${sdk.version}${sdk.rollForward ? ` · rollForward ${sdk.rollForward}` : ''}` : 'none']);
    facts.push(['target frameworks', list(ctx.projects.flatMap((p) => p.frameworks))]);
    for (const p of ctx.projects) {
      facts.push([`project ${p.name}`, `${p.file} · ${projectKind(p)} · ${p.frameworks.join(';') || 'no target framework'}`]);
    }
    if (ctx.outsideSolution.length) notes.push(`Project files not in the solution: ${ctx.outsideSolution.join(', ')}.`);

    const nonTest = ctx.projects.filter((p) => !p.isTest);
    facts.push(['projects with Nullable enabled', ratio('nullable', nonTest.filter((p) => p.props.Nullable === 'enable'), nonTest.length, evidence, nonTest.filter((p) => p.props.Nullable !== 'enable').map((p) => p.name))]);
    facts.push(['projects with ImplicitUsings enabled', share(ctx.projects.filter((p) => p.props.ImplicitUsings === 'enable').length, ctx.projects.length)]);
    facts.push(['projects with TreatWarningsAsErrors', share(ctx.projects.filter((p) => p.props.TreatWarningsAsErrors === 'true').length, ctx.projects.length)]);
    facts.push(['LangVersion', list(ctx.projects.map((p) => p.props.LangVersion).filter(Boolean)) === 'none' ? 'SDK default' : list(ctx.projects.map((p) => p.props.LangVersion).filter(Boolean))]);
    facts.push(['Directory.Build.props', present(ctx.allFiles.some((f) => /(^|\/)Directory\.Build\.props$/.test(f)))]);
    facts.push(['Central Package Management', present(ctx.cpm)]);
    facts.push(['packages.lock.json', present(ctx.projects.some((p) => p.lock))]);

    const nonUniform = [];
    for (const [id, versions] of Object.entries(ctx.deps)) {
      const users = ctx.projects.filter((p) => p.packages.some((r) => r.id === id)).map((p) => p.name);
      facts.push([`package ${id}`, `${versions.join(' / ')} · ${users.join(', ')}`]);
      if (versions.length > 1) nonUniform.push(id);
    }
    if (nonUniform.length) notes.push(`Different versions of the same package: ${nonUniform.join(', ')}.`);

    const target = ctx.solution ?? (ctx.projects[0]?.file ?? '');
    facts.push(['build command', cmd(ctx, `dotnet build ${target}`.trim())]);
    facts.push(['test command', ctx.projects.some((p) => p.isTest) ? cmd(ctx, `dotnet test ${target}`.trim()) : 'none (no test project)']);
    const startups = ctx.projects.filter((p) => /app|web|worker/.test(projectKind(p)) && !p.isTest);
    for (const p of startups) facts.push([`run ${p.name}`, cmd(ctx, `dotnet run --project ${p.file}`)]);
    const windowsOnly = ctx.projects.filter(isWindowsOnly).map((p) => p.name);
    facts.push(['Windows-only projects', list(windowsOnly)]);
    if (windowsOnly.length) {
      const portable = ctx.projects.filter((p) => !isWindowsOnly(p)).map((p) => p.file);
      notes.push(`${windowsOnly.join(', ')} ${windowsOnly.length === 1 ? 'builds' : 'build'} only on Windows. Elsewhere build the other projects one by one${portable.length ? ` (${portable.join(', ')})` : ''} and list the rest as not checkable.`);
    }
    if (nonTest.some((p) => p.props.Nullable !== 'enable')) {
      notes.push('Nullable reference types are off in some projects: the compiler does not check null flow there. See `kit-dotnet contract nullability-across-layers`.');
    }
    return { facts, notes, evidence };
  },
};

const architecture = {
  topic: 'architecture',
  emits: 'project layers from project references, root namespaces, folders, where interfaces and models live',
  inputs: ['**/*.csproj', '**/*.cs'],
  run(ctx) {
    const evidence = {};
    const facts = [];
    const notes = [];
    const depth = layers(ctx);
    const ordered = [...ctx.projects].sort((a, b) => depth.get(a.file) - depth.get(b.file) || a.name.localeCompare(b.name));
    facts.push(['layers (bottom → top)', ordered.filter((p) => !p.isTest).map((p) => `${depth.get(p.file)}:${p.name}`).join(' → ') || 'none']);
    const byFile = new Map(ctx.projects.map((p) => [p.file, p.name]));
    for (const p of ordered) {
      facts.push([`${p.name} references`, list(p.references.map((r) => byFile.get(r) ?? `${r} (outside the solution)`))]);
    }
    for (const p of ordered) {
      facts.push([`${p.name} root namespace`, p.rootNamespace]);
    }
    for (const p of ordered.filter((x) => !x.isTest)) {
      const folders = ctx.codeFiles
        .filter((f) => ctx.projectOf(f) === p)
        .map((f) => (p.dir ? f.slice(p.dir.length + 1) : f))
        .filter((f) => f.includes('/'))
        .map((f) => f.split('/')[0]);
      facts.push([`${p.name} folders`, list(folders)]);
    }

    const withNamespace = ctx.codeFiles.filter((f) => namespaceOf(ctx.read(f)));
    const outside = withNamespace.filter((f) => {
      const ns = namespaceOf(ctx.read(f));
      const root = ctx.projectOf(f).rootNamespace;
      return !(ns === root || ns.startsWith(root + '.'));
    });
    facts.push(['namespace starts with the project root namespace', ratio('namespaceInRoot', withNamespace.filter((f) => !outside.includes(f)), withNamespace.length, evidence, outside)]);
    if (outside.length) {
      notes.push(`Some files declare a namespace outside their project's root namespace (${list(outside.map((f) => namespaceOf(ctx.read(f))))}); see \`kit-dotnet evidence architecture\`.`);
    }
    const mirrors = (f) => {
      const p = ctx.projectOf(f);
      const relDir = path.posix.dirname(p.dir ? f.slice(p.dir.length + 1) : f);
      const expected = relDir === '.' ? p.rootNamespace : `${p.rootNamespace}.${relDir.split('/').join('.')}`;
      return namespaceOf(ctx.read(f)) === expected;
    };
    facts.push(['namespace mirrors the folder path', measure(evidence, 'namespaceMirrorsFolder', withNamespace, mirrors)]);

    const interfaceFiles = ctx.codeFiles.filter((f) => typeDeclarations(ctx.read(f)).some((d) => d.kind === 'interface'));
    const interfaceFolders = interfaceFiles.map((f) => {
      const p = ctx.projectOf(f);
      return `${p.name}/${path.posix.dirname(p.dir ? f.slice(p.dir.length + 1) : f).split('/').slice(0, 2).join('/')}`;
    });
    facts.push(['interfaces live in', list(interfaceFolders)]);
    const separated = interfaceFiles.filter((f) => {
      const names = typeDeclarations(ctx.read(f)).filter((d) => d.kind === 'interface').map((d) => d.name.slice(1));
      return names.some((n) => !ctx.codeFiles.some((g) => ctx.projectOf(g) === ctx.projectOf(f) && typeDeclarations(ctx.read(g)).some((d) => d.kind === 'class' && d.name.endsWith(n))));
    });
    facts.push(['interfaces in a different project than their implementation', ratio('interfaceSeparateProject', separated, interfaceFiles.length, evidence)]);
    return { facts, notes, evidence };
  },
};

const data = {
  topic: 'data',
  emits: 'EF Core version and provider, DbContexts, model source, configuration style, migrations, repositories, transactions, time types',
  inputs: ['**/*.csproj', '**/*DbContext*.cs', '**/Migrations/**', 'entity classes', '*.sql'],
  run(ctx) {
    const evidence = {};
    const facts = [];
    const notes = [];
    const efVersion = ctx.resolved('Microsoft.EntityFrameworkCore')
      ?? Object.keys(PROVIDERS).map((id) => ctx.resolved(id)).find(Boolean) ?? null;
    facts.push(['EF Core', efVersion ?? 'not used']);
    facts.push(['providers', list(Object.entries(PROVIDERS).filter(([id]) => ctx.has(id)).map(([, name]) => name))]);
    facts.push(['Dapper', present(ctx.has('Dapper'))]);
    const contexts = dbContexts(ctx);
    for (const c of contexts) {
      facts.push([`DbContext ${c.name}`, `${c.project} · ${c.file}`]);
      facts.push([`${c.name} entities`, list(c.sets)]);
    }
    if (!contexts.length && !efVersion) {
      notes.push('No EF Core in this solution.');
      return { facts, notes, evidence };
    }
    if (contexts.length > 1) notes.push('More than one DbContext: every migration command needs --context, --project and --startup-project. Confirm the pairs with convention-creator.');

    const registration = [
      ['AddDbContextPool', /AddDbContextPool\s*</], ['AddDbContextFactory', /AddDbContextFactory\s*</],
      ['AddPooledDbContextFactory', /AddPooledDbContextFactory\s*</], ['AddDbContext', /AddDbContext\s*</],
      ['OnConfiguring', /override\s+void\s+OnConfiguring/],
    ].filter(([, re]) => ctx.filesMatching(re).length).map(([n]) => n);
    facts.push(['DbContext registration', list(registration)]);

    const migrationsDirs = ctx.migrationFiles.map((f) => path.posix.dirname(f));
    const snapshots = ctx.migrationFiles.filter((f) => /ModelSnapshot\.cs$/.test(f));
    const scaffolded = ctx.filesMatching(/OnModelCreatingPartial/).length > 0;
    const sqlScripts = ctx.allFiles.filter((f) => /\.sql$/i.test(f));
    facts.push(['model source', snapshots.length ? 'code-first (migrations)' : scaffolded ? 'scaffolded from the database (database-first)' : 'code-first without migrations']);
    facts.push(['migrations folders', list(migrationsDirs)]);
    facts.push(['schema scripts', list(sqlScripts)]);
    facts.push(['MigrationsAssembly', present(ctx.filesMatching(/MigrationsAssembly\s*\(/).length > 0)]);
    const apply = [
      ['Database.Migrate()', /\.Migrate(Async)?\s*\(/], ['EnsureCreated()', /EnsureCreated(Async)?\s*\(/],
    ].filter(([, re]) => ctx.filesMatching(re).length).map(([n]) => n);
    facts.push(['schema applied by', apply.length ? list(apply) : sqlScripts.length ? 'SQL script, by hand' : 'not in code (dotnet ef database update or a script)']);

    const contextFiles = new Set(contexts.map((c) => c.file));
    const configClasses = ctx.filesMatching(/IEntityTypeConfiguration\s*</);
    const inline = [...contextFiles].filter((f) => /modelBuilder\.Entity\s*</.test(ctx.read(f)));
    const entities = entityFiles(ctx);
    const annotated = entities.filter((f) => /\[(Key|Table|Column|Required|MaxLength|StringLength|ForeignKey)\b/.test(ctx.read(f)));
    evidence.configuration = { entityTypeConfigurationFiles: configClasses, onModelCreatingFiles: inline, annotatedEntityFiles: annotated };
    const styles = [configClasses.length && 'IEntityTypeConfiguration<T> classes', inline.length && 'OnModelCreating in the DbContext', annotated.length && 'data annotations on entities'].filter(Boolean);
    facts.push(['model configuration', styles.length ? styles.join(', ') : 'conventions only']);
    facts.push(['ApplyConfigurationsFromAssembly', present(ctx.filesMatching(/ApplyConfigurationsFromAssembly/).length > 0)]);
    facts.push(['tracking default', ctx.filesMatching(/UseQueryTrackingBehavior\s*\(\s*QueryTrackingBehavior\.NoTracking/).length ? 'NoTracking' : 'tracking (EF Core default)']);
    facts.push(['AsNoTracking in queries', present(ctx.filesMatching(/AsNoTracking/).length > 0)]);
    facts.push(['global query filters', present(ctx.filesMatching(/HasQueryFilter/).length > 0)]);
    facts.push(['concurrency tokens', present(ctx.filesMatching(/IsRowVersion|IsConcurrencyToken|\[Timestamp\]|\[ConcurrencyCheck\]/).length > 0)]);
    facts.push(['raw SQL', present(ctx.filesMatching(/FromSql|ExecuteSql|SqlQuery/).length > 0)]);
    facts.push(['ExecuteUpdate / ExecuteDelete', present(ctx.filesMatching(/ExecuteUpdate|ExecuteDelete/).length > 0)]);
    facts.push(['explicit transactions', present(ctx.filesMatching(/BeginTransaction|TransactionScope/).length > 0)]);

    const repositories = ctx.codeFiles.filter((f) => /class\s+\w*Repository\b/.test(ctx.read(f)));
    facts.push(['repository classes', list(repositories)]);
    facts.push(['generic repository', present(ctx.filesMatching(/interface\s+I\w*Repository\s*<\s*T\w*\s*>/).length > 0)]);
    const commitsIn = [...new Set(ctx.filesMatching(/SaveChanges(Async)?\s*\(/).map((f) => (repositories.includes(f) ? 'repositories' : contextFiles.has(f) ? 'DbContext' : 'services and other callers')))].sort();
    facts.push(['SaveChanges called in', list(commitsIn)]);
    if (commitsIn.includes('repositories')) {
      notes.push('Repositories call SaveChanges themselves, so one service operation can commit several times. See `kit-dotnet contract commit-side-effect-order`.');
    }

    const timeTypes = new Set();
    const textDates = [];
    for (const f of entities) {
      const text = ctx.read(f);
      for (const t of ['DateTimeOffset', 'DateOnly', 'TimeOnly']) if (new RegExp(`\\b${t}\\??\\s+\\w+\\s*\\{`).test(text)) timeTypes.add(t);
      if (/\bDateTime\??\s+\w+\s*\{/.test(text)) timeTypes.add('DateTime');
      for (const m of text.matchAll(/\bstring\??\s+(\w*(?:Date|Time|Day)\w*)\s*\{/g)) textDates.push(`${path.posix.basename(f, '.cs')}.${m[1]}`);
    }
    facts.push(['time types in entities', list([...timeTypes])]);
    facts.push(['dates stored as text', list(textDates)]);
    if (textDates.length) notes.push('Some dates are stored as strings; they sort and compare as text. See `kit-dotnet contract time-kind`.');

    const literal = ctx.filesMatching(/"[^"\n]*\b(server|Server|Data Source|Host|host)\s*=[^"\n]*;[^"\n]*"/);
    facts.push(['connection string', literal.length ? 'literal in code' : ctx.filesMatching(/GetConnectionString\s*\(/).length ? 'from configuration (GetConnectionString)' : 'not found']);
    evidence.connectionStringLiterals = literal;
    if (literal.length) notes.push('A connection string is written in code; move it to configuration or user secrets before it reaches a shared repository with a password.');
    return { facts, notes, evidence };
  },
};

const api = {
  topic: 'api',
  emits: 'web projects, endpoint style, OpenAPI generator and committed spec, error format, JSON options, auth, outgoing HTTP',
  inputs: ['**/*.csproj', 'Program.cs', 'controllers and endpoint files', 'openapi/swagger documents'],
  run(ctx) {
    const facts = [];
    const notes = [];
    const web = ctx.projects.filter(isWeb);
    facts.push(['web projects', list(web.map((p) => p.name))]);
    const controllers = ctx.filesMatching(/:\s*(Controller|ControllerBase)\b|\[ApiController\]/);
    const minimal = ctx.filesMatching(/\.Map(Get|Post|Put|Delete|Patch|Group|Methods)\s*\(/);
    facts.push(['endpoint style', controllers.length && minimal.length ? 'mixed: controllers and minimal APIs' : controllers.length ? 'controllers' : minimal.length ? 'minimal APIs' : 'none']);
    const generators = [
      ['Swashbuckle.AspNetCore', 'Swashbuckle'], ['NSwag.AspNetCore', 'NSwag'], ['Microsoft.AspNetCore.OpenApi', 'Microsoft.AspNetCore.OpenApi'],
      ['Microsoft.Extensions.ApiDescription.Server', 'build-time document generation'], ['Scalar.AspNetCore', 'Scalar UI'],
    ].filter(([id]) => ctx.has(id)).map(([, n]) => n);
    facts.push(['OpenAPI', list(generators)]);
    facts.push(['committed spec files', list(ctx.allFiles.filter((f) => /(^|\/)(openapi|swagger)[\w.-]*\.(json|ya?ml)$/i.test(f)))]);
    facts.push(['ProblemDetails', present(ctx.filesMatching(/AddProblemDetails|ProblemDetails/).length > 0)]);
    facts.push(['exception handler', present(ctx.filesMatching(/UseExceptionHandler|IExceptionHandler/).length > 0)]);
    facts.push(['API versioning', present(ctx.hasPrefix('Asp.Versioning') || ctx.hasPrefix('Microsoft.AspNetCore.Mvc.Versioning'))]);
    facts.push(['enums as strings in JSON', present(ctx.filesMatching(/JsonStringEnumConverter|StringEnumConverter/).length > 0)]);
    facts.push(['Newtonsoft.Json', present(ctx.has('Newtonsoft.Json') || ctx.has('Microsoft.AspNetCore.Mvc.NewtonsoftJson'))]);
    facts.push(['authentication', list([
      ctx.filesMatching(/AddJwtBearer/).length && 'JWT bearer', ctx.filesMatching(/AddIdentity|AddDefaultIdentity|AddIdentityApiEndpoints/).length && 'ASP.NET Core Identity',
      ctx.filesMatching(/AddCookie\s*\(/).length && 'cookies', ctx.hasPrefix('Microsoft.Identity.Web') && 'Microsoft Identity Web',
    ].filter(Boolean))]);
    facts.push(['outgoing HTTP', list([
      ctx.filesMatching(/AddHttpClient\s*[<(]/).length && 'IHttpClientFactory', ctx.filesMatching(/new\s+HttpClient\s*\(/).length && 'new HttpClient()',
      ctx.hasPrefix('Refit') && 'Refit', ctx.filesMatching(/WebView2|CoreWebView2/, ctx.csFiles).length && 'embedded WebView2',
    ].filter(Boolean))]);
    if (!web.length) notes.push('No ASP.NET Core project: this solution publishes no HTTP API.');
    if (web.length && !generators.length) notes.push('Web project without an OpenAPI generator: clients have no published contract. See `kit-dotnet contract api-spec-fidelity`.');
    return { facts, notes, evidence: {} };
  },
};

const di = {
  topic: 'di',
  emits: 'host, composition root, lifetimes in use, open generics, conflicting registrations, service locator, options pattern',
  inputs: ['Program.cs / App.xaml.cs / Startup.cs', '**/*.cs registrations'],
  run(ctx) {
    const evidence = {};
    const facts = [];
    const notes = [];
    const hosts = [
      ['WebApplication.CreateBuilder', /WebApplication\.Create(Slim)?Builder/], ['Host.CreateApplicationBuilder', /Host\.CreateApplicationBuilder/],
      ['Host.CreateDefaultBuilder', /Host\s*\.\s*CreateDefaultBuilder/], ['MauiApp.CreateBuilder', /MauiApp\.CreateBuilder/],
      ['new ServiceCollection()', /new\s+ServiceCollection\s*\(/],
    ].filter(([, re]) => ctx.filesMatching(re).length).map(([n]) => n);
    facts.push(['host', list(hosts)]);
    const registrationFiles = ctx.filesMatching(/\.\s*Add(Singleton|Scoped|Transient)\s*[<(]/);
    facts.push(['registration files', list(registrationFiles)]);

    const registrations = [];
    for (const f of registrationFiles) {
      const text = ctx.read(f);
      for (const m of text.matchAll(/\.\s*Add(Singleton|Scoped|Transient)\s*<\s*([\w.]+(?:<[^<>]*>)?)\s*(?:,\s*[\w.]+(?:<[^<>]*>)?\s*)?>/g)) {
        registrations.push({ lifetime: m[1].toLowerCase(), service: m[2], file: f });
      }
      for (const m of text.matchAll(/\.\s*Add(Singleton|Scoped|Transient)\s*\(\s*typeof\s*\(\s*([\w.]+<,*>)\s*\)/g)) {
        registrations.push({ lifetime: m[1].toLowerCase(), service: m[2], file: f, open: true });
      }
    }
    const byLifetime = (l) => registrations.filter((r) => r.lifetime === l).length;
    evidence.lifetimes = { singleton: byLifetime('singleton'), scoped: byLifetime('scoped'), transient: byLifetime('transient') };
    for (const l of ['singleton', 'scoped', 'transient']) {
      facts.push([`${l} registrations`, share(byLifetime(l), registrations.length)]);
    }
    const dbRegistered = ctx.filesMatching(/AddDbContext(Pool)?\s*</).length > 0;
    facts.push(['open generic registrations', present(registrations.some((r) => r.open))]);

    const baseName = (s) => s.replace(/<.*$/, '');
    const lifetimesByBase = {};
    for (const r of registrations) (lifetimesByBase[baseName(r.service)] ??= new Set()).add(r.lifetime);
    const conflicting = Object.entries(lifetimesByBase).filter(([, set]) => set.size > 1).map(([name, set]) => `${name} (${[...set].sort().join(', ')})`);
    facts.push(['services registered with more than one lifetime', list(conflicting)]);
    if (conflicting.length) notes.push(`${conflicting.join('; ')}: the last registration wins per closed type, the open generic for the rest. See \`kit-dotnet contract lifetime-matched-injection\`.`);

    const locator = ctx.filesMatching(/\.Services\.Get(Required)?Service\s*[<(]|\bGetService<\w+>\s*\(\)|App\.GetService\s*</);
    facts.push(['service locator (resolving from the container in code)', present(locator.length > 0)]);
    evidence.serviceLocator = { count: locator.length, files: locator };
    const scopes = ctx.filesMatching(/CreateScope\s*\(|CreateAsyncScope\s*\(|IServiceScopeFactory/);
    facts.push(['explicit scopes (CreateScope)', present(scopes.length > 0)]);
    const isWebHost = hosts.includes('WebApplication.CreateBuilder');
    if (!isWebHost && locator.length && !scopes.length && (byLifetime('scoped') || dbRegistered)) {
      notes.push('Scoped services (and the DbContext) are resolved from the root provider with no scope: they live as long as the process. See `kit-dotnet contract lifetime-matched-injection`.');
    }
    facts.push(['options pattern', present(ctx.filesMatching(/\.Configure<|AddOptions<|IOptions</).length > 0)]);
    facts.push(['keyed services', present(ctx.filesMatching(/AddKeyed(Singleton|Scoped|Transient)/).length > 0)]);
    facts.push(['container libraries', list(['Autofac', 'Scrutor', 'Lamar', 'DryIoc'].filter((id) => ctx.hasPrefix(id)))]);
    const primary = ctx.filesMatching(/\bclass\s+\w+\s*\([^)]*\b[A-Z]\w*\s+\w+[^)]*\)\s*(:|\{|\n)/);
    const classic = ctx.filesMatching(/private\s+readonly\s+I\w+\s+_\w+;[\s\S]*public\s+\w+\s*\(/);
    facts.push(['constructor injection', primary.length && classic.length ? 'mixed: primary constructors and readonly fields' : primary.length ? 'primary constructors' : classic.length ? 'constructor assigning private readonly fields' : 'none found']);
    return { facts, notes, evidence };
  },
};

const ui = {
  topic: 'ui',
  emits: 'UI framework, MVVM library and patterns, view to view-model wiring, navigation, UI types in view models, async void',
  inputs: ['**/*.csproj', '**/*.xaml', '**/*.razor', '**/*.cshtml', '**/*ViewModel*.cs'],
  run(ctx) {
    const evidence = {};
    const facts = [];
    const notes = [];
    const frameworks = [
      ctx.projects.some((p) => p.props.UseWinUI === 'true') && 'WinUI 3 (Windows App SDK)',
      ctx.projects.some((p) => p.props.UseWPF === 'true') && 'WPF',
      ctx.projects.some((p) => p.props.UseWindowsForms === 'true') && 'WinForms',
      ctx.projects.some((p) => p.props.UseMaui === 'true') && '.NET MAUI',
      ctx.hasPrefix('Avalonia') && 'Avalonia',
      ctx.allFiles.some((f) => f.endsWith('.razor')) && 'Blazor / Razor components',
      ctx.allFiles.some((f) => f.endsWith('.cshtml')) && 'Razor Pages / MVC views',
    ].filter(Boolean);
    facts.push(['UI framework', list(frameworks)]);
    if (!frameworks.length) {
      notes.push('No UI project in this solution.');
      return { facts, notes, evidence };
    }
    const mvvm = [
      ['CommunityToolkit.Mvvm', 'CommunityToolkit.Mvvm'], ['Prism', 'Prism'], ['ReactiveUI', 'ReactiveUI'], ['MvvmLightLibs', 'MVVM Light'], ['Caliburn.Micro', 'Caliburn.Micro'],
    ].filter(([id]) => ctx.hasPrefix(id)).map(([, n]) => n);
    facts.push(['MVVM library', list(mvvm)]);
    const viewModels = ctx.codeFiles.filter((f) => /class\s+\w+ViewModel\b/.test(ctx.read(f)));
    facts.push(['view model base classes', list(viewModels.flatMap((f) => [...ctx.read(f).matchAll(/class\s+\w+ViewModel\s*:\s*([\w.]+)/g)].map((m) => m[1])))]);
    facts.push(['[ObservableProperty] fields', ratio('observableProperty', viewModels.filter((f) => /\[ObservableProperty\]/.test(ctx.read(f))), viewModels.length, evidence)]);
    facts.push(['[RelayCommand] methods', ratio('relayCommand', viewModels.filter((f) => /\[RelayCommand/.test(ctx.read(f))), viewModels.length, evidence)]);
    facts.push(['ObservableCollection<T> for lists', present(ctx.filesMatching(/ObservableCollection</, viewModels).length > 0)]);

    const codeBehind = ctx.csFiles.filter((f) => /\.xaml\.cs$/.test(f));
    const located = ctx.filesMatching(/ViewModel\s*=\s*\w+\.GetService</, codeBehind);
    facts.push(['view model resolved in code-behind via the container', ratio('viewModelFromContainer', located, codeBehind.filter((f) => /ViewModel/.test(ctx.read(f))).length, evidence)]);
    const nav = [
      ctx.filesMatching(/interface\s+INavigationService/).length && 'own INavigationService',
      ctx.filesMatching(/Frame\??\.Navigate\s*\(/, ctx.csFiles).length && 'Frame.Navigate',
      ctx.filesMatching(/Shell\.Current\.GoToAsync/).length && 'Shell routes',
      ctx.filesMatching(/NavigationManager/).length && 'NavigationManager',
    ].filter(Boolean);
    facts.push(['navigation', list(nav)]);
    const uiTypes = viewModels.filter((f) => /using\s+(Microsoft\.UI\.Xaml(\.Controls)?|System\.Windows(\.Controls)?|Microsoft\.Maui\.Controls)\s*;/.test(ctx.read(f)) && /\b(TeachingTip|ContentDialog|XamlRoot|Window|Page|MessageBox|Frame)\b/.test(ctx.read(f)));
    facts.push(['view models hold UI controls', ratio('uiTypesInViewModels', uiTypes, viewModels.length, evidence, uiTypes)]);
    const asyncVoid = ctx.codeFiles.filter((f) => /async\s+void\s+(?!On\w+\s*\(\s*object|\w+_\w+\s*\()\w+\s*\(/.test(ctx.read(f)));
    facts.push(['async void methods (not event handlers)', present(asyncVoid.length > 0)]);
    evidence.asyncVoid = asyncVoid;
    if (asyncVoid.length) notes.push('async void outside event handlers: exceptions crash the app and callers cannot await. With CommunityToolkit.Mvvm, an async Task [RelayCommand] gives an AsyncRelayCommand.');
    const xaml = ctx.allFiles.filter((f) => f.endsWith('.xaml'));
    facts.push(['x:Bind / Binding in XAML', list([ctx.filesMatching(/\{x:Bind\b/, xaml).length && 'x:Bind', ctx.filesMatching(/\{Binding\b/, xaml).length && 'Binding'].filter(Boolean))]);
    facts.push(['localised resources (.resw / .resx)', present(ctx.allFiles.some((f) => /\.(resw|resx)$/.test(f)))]);
    const accented = /"[^"\n]*[áéíóöőúüűÁÉÍÓÖŐÚÜŰ][^"\n]*"/;
    facts.push(['hard-coded user-visible text', present(ctx.filesMatching(accented, viewModels).length > 0 || ctx.filesMatching(/(Text|Content|Header|Title)="[^"{]*[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/, xaml).length > 0)]);
    return { facts, notes, evidence };
  },
};

const validation = {
  topic: 'validation',
  emits: 'validation libraries and where input is validated',
  inputs: ['**/*.csproj', 'DTOs, view models, endpoints'],
  run(ctx) {
    const facts = [];
    const libs = ['FluentValidation', 'MiniValidation', 'CommunityToolkit.Mvvm'].filter((id) => ctx.hasPrefix(id));
    facts.push(['validation libraries', list(libs.filter((l) => l !== 'CommunityToolkit.Mvvm'))]);
    facts.push(['FluentValidation validators', list(ctx.codeFiles.filter((f) => /AbstractValidator</.test(ctx.read(f))))]);
    facts.push(['data annotations on DTOs/models', present(ctx.filesMatching(/\[(Required|StringLength|Range|EmailAddress|RegularExpression|MinLength)\b/).length > 0)]);
    facts.push(['IValidatableObject', present(ctx.filesMatching(/IValidatableObject/).length > 0)]);
    facts.push(['ObservableValidator (MVVM)', present(ctx.filesMatching(/ObservableValidator/).length > 0)]);
    const manual = ctx.codeFiles.filter((f) => /class\s+\w+ViewModel\b/.test(ctx.read(f)) && /ValidationText|ValidationVisibility|ErrorMessage\w*\s*=|HasErrors/.test(ctx.read(f)));
    facts.push(['hand-written validation in view models', list(manual)]);
    facts.push(['ValidationException / ArgumentException thrown in code', present(ctx.filesMatching(/throw\s+new\s+(ArgumentException|ValidationException|ArgumentOutOfRangeException)\b/).length > 0)]);
    return { facts, notes: [], evidence: {} };
  },
};

const mapping = {
  topic: 'mapping',
  emits: 'mapping libraries, manual projections, DTO and view-model naming, where mapping happens',
  inputs: ['**/*.csproj', '**/*.cs'],
  run(ctx) {
    const facts = [];
    const evidence = {};
    facts.push(['mapping libraries', list([['AutoMapper', 'AutoMapper'], ['Mapster', 'Mapster'], ['Riok.Mapperly', 'Mapperly']].filter(([id]) => ctx.hasPrefix(id)).map(([, n]) => n))]);
    const projections = ctx.filesMatching(/\.Select\s*\(\s*\w+\s*=>\s*new\s+\w+/);
    facts.push(['manual projections (Select(x => new …))', list(projections)]);
    const extensions = ctx.filesMatching(/static\s+\w+\s+To\w+\s*\(\s*this\s+/);
    facts.push(['mapping extension methods (ToDto(this …))', list(extensions)]);
    const suffixes = new Set();
    for (const f of ctx.codeFiles) {
      for (const d of typeDeclarations(ctx.read(f))) {
        const m = /(Dto|DTO|VmList|Vm|ViewModel|Model|Request|Response|Command|Query|Result)$/.exec(d.name);
        if (m && d.kind !== 'interface' && !/ViewModel$/.test(d.name)) suffixes.add(m[1]);
      }
    }
    facts.push(['data-carrier type suffixes', list([...suffixes])]);
    const dtoFolders = ctx.codeFiles.filter((f) => /\/(Dtos?|DTOs?|Models)\//.test(f) && typeDeclarations(ctx.read(f)).some((d) => d.kind !== 'interface')).map((f) => path.posix.dirname(f));
    facts.push(['DTO / model folders', list(dtoFolders)]);
    evidence.projections = projections;
    return { facts, notes: [], evidence };
  },
};

const style = {
  topic: 'style',
  emits: 'observed C# code style: namespaces, braces, fields, var, regions, XML docs, comment language, async naming, nullable directives',
  inputs: ['**/*.cs (excluding migrations and generated files)'],
  run(ctx) {
    const evidence = {};
    const facts = [];
    const notes = [];
    const files = ctx.codeFiles;
    const read = (f) => ctx.read(f);
    facts.push(['file-scoped namespaces', measure(evidence, 'fileScopedNamespace', files.filter((f) => /^\s*namespace\s/m.test(read(f))), (f) => /^\s*namespace\s+[\w.]+\s*;/m.test(read(f)))]);
    facts.push(['usings outside the namespace', measure(evidence, 'usingsOutside', files.filter((f) => /^\s*using\s+[\w.]+\s*;/m.test(read(f))), (f) => {
      const text = read(f);
      const ns = text.search(/^\s*namespace\s/m);
      const firstUsing = text.search(/^\s*using\s+[\w.]+\s*;/m);
      return ns < 0 || firstUsing < ns;
    })]);
    facts.push(['open brace on its own line (Allman)', measure(evidence, 'allman', files.filter((f) => /\)\s*\{|\)\s*\n\s*\{/.test(read(f))), (f) => (read(f).match(/\)[ \t]*\r?\n[ \t]*\{/g) ?? []).length >= (read(f).match(/\)[ \t]*\{[ \t]*\r?\n/g) ?? []).length)]);
    const withFields = files.filter((f) => /\bprivate\s+(readonly\s+)?[\w<>,\[\]?. ]+\s+_?\w+\s*[;=]/.test(read(f)));
    facts.push(['private fields named _camelCase', measure(evidence, 'underscoreFields', withFields, (f) => /\bprivate\s+(readonly\s+)?[\w<>,\[\]?. ]+\s+_[a-z]\w*\s*[;=]/.test(read(f)))]);
    const locals = files.filter((f) => /^\s+(var|[A-Z]\w*(<[^>]*>)?\??)\s+\w+\s*=\s*/m.test(read(f)));
    facts.push(['var for locals', measure(evidence, 'varLocals', locals, (f) => (read(f).match(/^\s+var\s+\w+\s*=/gm) ?? []).length >= (read(f).match(/^\s+(?:int|string|bool|[A-Z]\w*(?:<[^>]*>)?)\??\s+\w+\s*=\s*(?!>)/gm) ?? []).length)]);
    facts.push(['target-typed new()', present(ctx.filesMatching(/=\s*new\s*\(\s*\)/).length > 0)]);
    facts.push(['expression-bodied members (=>)', present(ctx.filesMatching(/\)\s*=>\s*[^;{]+;|\b\w+\s*=>\s*[^;{]+;/).length > 0)]);
    const classFiles = files.filter((f) => typeDeclarations(read(f)).some((d) => d.kind === 'class'));
    facts.push(['#region blocks in classes', measure(evidence, 'regions', classFiles, (f) => /#region/.test(read(f)))]);
    const regionNames = files.flatMap((f) => [...read(f).matchAll(/#region\s+(.+?)\s*$/gm)].map((m) => m[1]));
    facts.push(['region names', list(regionNames)]);
    const interfaces = files.filter((f) => typeDeclarations(read(f)).some((d) => d.kind === 'interface'));
    facts.push(['XML doc comments on interfaces', measure(evidence, 'xmlDocInterfaces', interfaces, (f) => /\/\/\/\s*<summary>/.test(read(f)))]);
    facts.push(['XML doc comments on classes', measure(evidence, 'xmlDocClasses', classFiles, (f) => /\/\/\/\s*<summary>/.test(read(f)))]);
    const comments = files.flatMap((f) => [...read(f).matchAll(/\/\/\/?\s*(?:<summary>)?\s*([^\n<]{3,})/g)].map((m) => m[1]));
    const hungarian = comments.filter((c) => /[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/.test(c) || /\b(és|vagy|nem|ha|Termék|lekérdezés)\b/.test(c));
    evidence.commentLanguage = { comments: comments.length, hungarian: hungarian.length };
    facts.push(['comment language', !comments.length ? 'no comments' : hungarian.length === 0 ? 'English' : hungarian.length / comments.length >= 0.8 ? 'Hungarian' : 'mixed Hungarian and English']);
    const asyncMethods = files.filter((f) => /\b(async\s+)?Task(<[^>]*>)?\s+\w+\s*\(/.test(read(f)));
    facts.push(['Task-returning methods end in Async', measure(evidence, 'asyncSuffix', asyncMethods, (f) => [...read(f).matchAll(/\bTask(?:<[^>]*>)?\s+(\w+)\s*\(/g)].every((m) => m[1].endsWith('Async')))]);
    const typeFiles = files.filter((f) => typeDeclarations(read(f)).length);
    facts.push(['one top-level type per file', measure(evidence, 'oneTypePerFile', typeFiles, (f) => typeDeclarations(read(f)).filter((d) => d.kind !== 'enum').length <= 1)]);
    facts.push(['file name equals the type name', measure(evidence, 'fileNameIsTypeName', typeFiles, (f) => typeDeclarations(read(f)).some((d) => d.name === path.posix.basename(f, '.cs').replace(/\.xaml$/, '')))]);
    const nullableDirectives = ctx.filesMatching(/^\s*#nullable\s/m);
    facts.push(['#nullable directives in files', present(nullableDirectives.length > 0)]);
    evidence.nullableDirectives = nullableDirectives;
    const pragmas = ctx.filesMatching(/#pragma\s+warning\s+disable/);
    facts.push(['#pragma warning disable', present(pragmas.length > 0)]);
    evidence.pragmaWarningDisable = pragmas;
    facts.push(['null! initializers', present(ctx.filesMatching(/=\s*null!/).length > 0)]);
    facts.push(['records', present(files.some((f) => typeDeclarations(read(f)).some((d) => d.kind.startsWith('record'))))]);
    facts.push(['UTF-8 BOM', measure(evidence, 'bom', files, (f) => ctx.hasBom(f))]);
    if (nullableDirectives.length || pragmas.length) notes.push('Some files change nullable context or silence warnings locally; see `kit-dotnet evidence style` for which.');
    return { facts, notes, evidence };
  },
};

const testing = {
  topic: 'testing',
  emits: 'test projects, frameworks, mocking and assertion libraries, integration test setup, test database',
  inputs: ['**/*.csproj', 'test projects'],
  run(ctx) {
    const facts = [];
    const tests = ctx.projects.filter((p) => p.isTest);
    facts.push(['test projects', list(tests.map((p) => p.name))]);
    const has = (ids) => ids.filter((id) => tests.some((p) => p.packages.some((r) => r.id === id || r.id.startsWith(id + '.'))));
    facts.push(['test framework', list(has(['xunit', 'xunit.v3', 'NUnit', 'MSTest', 'TUnit']))]);
    facts.push(['mocking', list(has(['Moq', 'NSubstitute', 'FakeItEasy']))]);
    facts.push(['assertions', list(has(['FluentAssertions', 'AwesomeAssertions', 'Shouldly']))]);
    facts.push(['WebApplicationFactory', present(has(['Microsoft.AspNetCore.Mvc.Testing']).length > 0)]);
    facts.push(['test database', list([
      has(['Microsoft.EntityFrameworkCore.InMemory']).length && 'EF Core InMemory', has(['Microsoft.EntityFrameworkCore.Sqlite']).length && 'SQLite',
      has(['Testcontainers']).length && 'Testcontainers', has(['Respawn']).length && 'Respawn',
    ].filter(Boolean))]);
    facts.push(['coverage', list(has(['coverlet.collector', 'coverlet.msbuild']))]);
    return { facts, notes: tests.length ? [] : ['There are no tests yet.'], evidence: {} };
  },
};

const lint = {
  topic: 'lint',
  emits: '.editorconfig settings, analyzers, build-time code style enforcement, format command',
  inputs: ['.editorconfig', '**/*.csproj', 'Directory.Build.props'],
  run(ctx) {
    const facts = [];
    const configs = ctx.allFiles.filter((f) => /(^|\/)\.editorconfig$/.test(f));
    facts.push(['.editorconfig', list(configs)]);
    const settings = {};
    for (const f of configs) {
      for (const m of ctx.read(f).matchAll(/^\s*([\w.]+)\s*=\s*(.+?)\s*$/gm)) settings[m[1]] = m[2];
    }
    const keys = [
      'indent_style', 'indent_size', 'end_of_line', 'charset',
      'csharp_style_namespace_declarations', 'csharp_using_directive_placement', 'dotnet_sort_system_directives_first',
      'csharp_new_line_before_open_brace', 'csharp_prefer_braces', 'csharp_style_var_for_built_in_types',
      'csharp_style_var_when_type_is_apparent', 'csharp_style_var_elsewhere', 'csharp_style_expression_bodied_methods',
      'csharp_style_expression_bodied_properties', 'csharp_style_implicit_object_creation_when_type_is_apparent',
      'csharp_prefer_simple_using_statement', 'dotnet_style_readonly_field', 'dotnet_style_require_accessibility_modifiers',
      'csharp_style_pattern_matching_over_as_with_null_check', 'dotnet_style_qualification_for_field',
    ];
    for (const k of keys) if (settings[k] !== undefined) facts.push([k, settings[k]]);
    const namingRules = Object.keys(settings).filter((k) => /^dotnet_naming_rule\.[\w]+\.style$/.test(k)).map((k) => k.split('.')[1]);
    facts.push(['naming rules', list(namingRules)]);
    facts.push(['analyzers', list(['StyleCop.Analyzers', 'SonarAnalyzer.CSharp', 'Roslynator.Analyzers', 'Meziantou.Analyzer', 'Microsoft.CodeAnalysis.NetAnalyzers', 'Microsoft.VisualStudio.Threading.Analyzers'].filter((id) => ctx.has(id)))]);
    facts.push(['projects with EnforceCodeStyleInBuild', share(ctx.projects.filter((p) => p.props.EnforceCodeStyleInBuild === 'true').length, ctx.projects.length)]);
    facts.push(['AnalysisLevel / AnalysisMode', list(ctx.projects.flatMap((p) => [p.props.AnalysisLevel, p.props.AnalysisMode]).filter(Boolean))]);
    facts.push(['WarningsAsErrors', list(ctx.projects.flatMap((p) => (p.props.WarningsAsErrors ?? '').split(/[;,]/)).map((s) => s.trim()).filter(Boolean))]);
    facts.push(['format command', cmd(ctx, `dotnet format ${ctx.solution ?? ''}`.trim())]);
    const notes = [];
    if (configs.length && !ctx.projects.some((p) => p.props.EnforceCodeStyleInBuild === 'true')) {
      notes.push('.editorconfig style rules are shown in the IDE but not enforced by `dotnet build` (EnforceCodeStyleInBuild is off); run the format command to check.');
    }
    return { facts, notes, evidence: {} };
  },
};

const examples = {
  topic: 'examples',
  emits: 'one real, in-repo example file per kind, picked by how well it follows the majority patterns',
  inputs: ['**/*.cs'],
  run(ctx) {
    const entityNames = new Set(dbContexts(ctx).flatMap((c) => c.sets));
    const decl = (f) => typeDeclarations(ctx.read(f));
    const kinds = [
      ['entity', ctx.codeFiles.filter((f) => decl(f).some((d) => entityNames.has(d.name)))],
      ['entity configuration', ctx.codeFiles.filter((f) => /IEntityTypeConfiguration\s*</.test(ctx.read(f)))],
      ['DbContext', dbContexts(ctx).map((c) => c.file)],
      ['repository', ctx.codeFiles.filter((f) => /class\s+\w*Repository\b/.test(ctx.read(f)))],
      ['service interface', ctx.codeFiles.filter((f) => /interface\s+I\w+Service\b/.test(ctx.read(f)))],
      ['service', ctx.codeFiles.filter((f) => /class\s+\w+Service\s*(\(|:)/.test(ctx.read(f)) && !/Microsoft\.UI|System\.Windows/.test(ctx.read(f)))],
      ['controller', ctx.codeFiles.filter((f) => /:\s*(Controller|ControllerBase)\b/.test(ctx.read(f)))],
      ['minimal API endpoints', ctx.codeFiles.filter((f) => /\.Map(Get|Post|Put|Delete|Group)\s*\(/.test(ctx.read(f)))],
      ['view model', ctx.codeFiles.filter((f) => /class\s+\w+ViewModel\b/.test(ctx.read(f)) && /\[RelayCommand|ICommand/.test(ctx.read(f)))],
      ['DTO', ctx.codeFiles.filter((f) => decl(f).some((d) => /(Dto|Request|Response)$/.test(d.name)))],
      ['test', ctx.testFiles.filter((f) => /\[(Fact|Theory|Test|TestMethod)\b/.test(ctx.read(f)))],
    ];
    const facts = [];
    for (const [kind, candidates] of kinds) {
      if (!candidates.length) continue;
      const scored = [...new Set(candidates)]
        .map((f) => ({ f, score: houseScore(ctx.read(f)) }))
        .sort((a, b) => b.score - a.score || a.f.length - b.f.length || a.f.localeCompare(b.f));
      facts.push([kind, scored[0].f]);
    }
    return { facts, notes: ['Open the example before writing a new file of that kind.'], evidence: {} };
  },
};

/** Rewards the patterns a well-kept .NET file is expected to follow. Used only to rank examples. */
function houseScore(text) {
  let score = 0;
  if (/^\s*namespace\s+[\w.]+\s*;/m.test(text)) score++;
  if (/\/\/\/\s*<summary>/.test(text)) score++;
  if (!/#pragma\s+warning\s+disable|#nullable\s+disable/.test(text)) score++;
  if (!/async\s+void\s+\w+\s*\(\s*\)/.test(text)) score++;
  if (/private\s+readonly\s/.test(text) || /class\s+\w+\s*\([^)]+\)/.test(text)) score++;
  return score;
}

export const SCANNERS = [workspace, architecture, data, api, di, ui, validation, mapping, style, testing, lint, examples];

/** Facts the router needs, without writing a topic file. */
export function routerFacts(ctx) {
  const contexts = dbContexts(ctx);
  return {
    efCore: contexts.length > 0 || ctx.hasPrefix('Microsoft.EntityFrameworkCore'),
    codeFirst: ctx.migrationFiles.some((f) => /ModelSnapshot\.cs$/.test(f)),
    aspnetcore: ctx.projects.some(isWeb),
    tests: ctx.projects.some((p) => p.isTest),
    windowsOnly: ctx.projects.filter(isWindowsOnly).map((p) => p.name),
  };
}

