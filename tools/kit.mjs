// Marketplace-side kit CLI: run from the root of this repository.
//   node tools/kit.mjs sync [--check]   derive every generated file in one pass
//   node tools/kit.mjs verify [--base <ref>]   check the invariants (I1–I6; CI adds I7)
//   node tools/kit.mjs new <contract|skill|command> <name> [--pack <pack>]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKS = path.join(ROOT, 'packs');
const CORE_CONTRACTS = path.join(PACKS, 'kit-core', 'contracts');
const LOCK = path.join(ROOT, 'registry.lock.json');
const CLAUDE_MD = path.join(ROOT, 'CLAUDE.md');
const MARKETPLACE = path.join(ROOT, '.claude-plugin', 'marketplace.json');
const GEN_START = '<!-- kit:generated:start · written by `npm run sync`, do not edit below -->';
const GEN_END = '<!-- kit:generated:end -->';
/**
 * Skills of the official layer (other marketplaces) that kit files may name. One list per stack
 * pack; kit-core may name any of them, because it is stack-independent.
 */
const EXTERNAL_SKILLS = {
  'kit-dotnet': [
    'csharp-expert', 'csharp-refactoring', 'msbuild', 'setup-local-sdk',
    'optimizing-ef-core-queries', 'create-datadriven-aspnetcore',
    'dotnet-webapi', 'convert-blazor-server-to-webapp',
    'migrate-dotnet8-to-dotnet9', 'migrate-dotnet9-to-dotnet10', 'migrate-dotnet10-to-dotnet11',
    'migrate-nullable-references', 'dotnet-aot-compat', 'convert-to-cpm',
  ],
};

const args = process.argv.slice(2);
const command = args[0];
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const handlers = { sync, verify, new: create };
if (!handlers[command]) {
  console.log('usage: node tools/kit.mjs <sync [--check] | verify [--base ref] | new <kind> <name> [--pack p]>');
  process.exit(command ? 2 : 0);
}
handlers[command]();

// ---------- helpers ----------

function read(file) {
  try {
    return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  } catch {
    return null;
  }
}

function hash(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function rel(file) {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

function list(dir, filter = () => true) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...list(full, filter));
    else if (filter(full)) out.push(full);
  }
  return out.sort();
}

function frontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---/.exec(text ?? '');
  if (!m) return null;
  const data = {};
  let parent = null;
  for (const line of m[1].split('\n')) {
    const top = /^([\w-]+):\s*(.*)$/.exec(line);
    const nested = /^\s+([\w-]+):\s*(.*)$/.exec(line);
    if (top) {
      const value = top[2].replace(/\s+#.*$/, '').trim().replace(/^["'](.*)["']$/, '$1');
      if (value === '') {
        data[top[1]] = {};
        parent = top[1];
      } else {
        data[top[1]] = value;
        parent = null;
      }
    } else if (nested && parent) {
      data[parent][nested[1]] = nested[2].trim().replace(/^["'](.*)["']$/, '$1');
    }
  }
  return data;
}

function git(gitArgs) {
  try {
    return execFileSync('git', gitArgs, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

function packs() {
  return fs.readdirSync(PACKS).filter((p) => fs.existsSync(path.join(PACKS, p, '.claude-plugin', 'plugin.json'))).sort();
}

/** A stack pack ships the project-side `kit` CLI; it gets a copy of the core contracts. */
function stackPacks() {
  return packs().filter((p) => fs.existsSync(path.join(PACKS, p, 'tools', 'kit.mjs')));
}

function coreCopyDir(pack) {
  return path.join(PACKS, pack, 'contracts', 'core');
}

function isCoreCopy(file) {
  return stackPacks().some((p) => file.startsWith(coreCopyDir(p) + path.sep));
}

// ---------- the registry: everything the kit consists of ----------

function collect() {
  const items = [];
  for (const pack of packs()) {
    const dir = path.join(PACKS, pack);
    for (const file of list(path.join(dir, 'contracts'), (f) => f.endsWith('.md') && !isCoreCopy(f))) {
      const text = read(file);
      const meta = frontmatter(text) ?? {};
      items.push({ kind: 'contract', pack, name: meta.name ?? path.basename(file, '.md'), version: meta.version ?? null, path: rel(file), text, meta });
    }
    for (const file of list(path.join(dir, 'skills'), (f) => path.basename(f) === 'SKILL.md')) {
      const text = read(file);
      const meta = frontmatter(text) ?? {};
      items.push({ kind: 'skill', pack, name: meta.name ?? path.basename(path.dirname(file)), version: meta.metadata?.version ?? null, path: rel(file), text, meta });
    }
    for (const file of list(path.join(dir, 'commands'), (f) => f.endsWith('.md'))) {
      const text = read(file);
      items.push({ kind: 'command', pack, name: path.basename(file, '.md'), version: null, path: rel(file), text, meta: frontmatter(text) ?? {} });
    }
  }
  return items;
}

/** Hash of every file in a pack, so a plugin's version can be checked against its content. */
function packHash(pack, overlay) {
  const dir = path.join(PACKS, pack);
  // `overlay` holds files sync is about to write, so one pass already hashes the final state.
  const existing = list(dir).filter((f) => !isCoreCopy(f) || f in overlay);
  const files = new Set([...existing, ...Object.keys(overlay).filter((f) => f.startsWith(dir + path.sep))]);
  const parts = [...files].sort().map((f) => `${rel(f)}\n${overlay[f] ?? read(f)}`);
  return hash(parts.join('\n'));
}

function buildLock(items, overlay) {
  const plugins = packs().map((pack) => {
    const manifest = JSON.parse(read(path.join(PACKS, pack, '.claude-plugin', 'plugin.json')));
    return { name: manifest.name, version: manifest.version ?? null, hash: packHash(pack, overlay) };
  });
  return JSON.stringify({
    plugins,
    items: items.map((i) => ({ kind: i.kind, pack: i.pack, name: i.name, version: i.version, path: i.path, hash: hash(i.text) })),
  }, null, 2) + '\n';
}

function buildCopies() {
  const copies = {};
  for (const pack of stackPacks()) {
    for (const file of list(CORE_CONTRACTS, (f) => f.endsWith('.md'))) {
      copies[path.join(coreCopyDir(pack), path.basename(file))] = read(file);
    }
  }
  return copies;
}

function buildClaudeMd(items) {
  const current = read(CLAUDE_MD) ?? '# .NET AI kit marketplace\n';
  const head = current.includes(GEN_START) ? current.slice(0, current.indexOf(GEN_START)) : current.replace(/\s*$/, '\n\n');
  const row = (cells) => `| ${cells.join(' | ')} |`;
  const section = (title, header, rows) => [
    `### ${title} (${rows.length})`, '', row(header), row(header.map(() => '---')), ...rows.map(row), '',
  ];
  const by = (kind) => items.filter((i) => i.kind === kind);
  const lines = [
    GEN_START,
    '',
    '## Inventory',
    '',
    ...section('Plugins', ['plugin', 'version'], packs().map((p) => {
      const m = JSON.parse(read(path.join(PACKS, p, '.claude-plugin', 'plugin.json')));
      return [m.name, m.version];
    })),
    ...section('Contracts', ['contract', 'pack', 'version', 'status', 'applies when'], by('contract').map((c) => [c.name, c.pack, c.version, c.meta.status ?? '', c.meta['applies-when'] ?? ''])),
    ...section('Skills', ['skill', 'pack', 'version', 'kind'], by('skill').map((s) => [s.name, s.pack, s.version, s.meta.metadata?.kind ?? ''])),
    ...section('Commands', ['command', 'pack', 'description'], by('command').map((c) => [`/${c.name}`, c.pack, c.meta.description ?? ''])),
    GEN_END,
    '',
  ];
  return head + lines.join('\n');
}

function derived() {
  const items = collect();
  const copies = buildCopies();
  return {
    items,
    files: {
      ...copies,
      [LOCK]: buildLock(items, copies),
      [CLAUDE_MD]: buildClaudeMd(items),
    },
  };
}

// ---------- commands ----------

function sync() {
  const { files } = derived();
  const check = args.includes('--check');
  const changed = [];
  for (const [file, content] of Object.entries(files)) {
    if (read(file) !== content) {
      changed.push(rel(file));
      if (!check) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, content);
      }
    }
  }
  for (const orphan of stackPacks().flatMap((p) => list(coreCopyDir(p))).filter((f) => !(f in files))) {
    changed.push(`${rel(orphan)} (removed)`);
    if (!check) fs.rmSync(orphan);
  }
  if (check) {
    if (changed.length) {
      console.log('out of sync:\n' + changed.map((c) => `  ${c}`).join('\n'));
      process.exit(1);
    }
    console.log('in sync');
    return;
  }
  console.log(changed.length ? changed.map((c) => `wrote ${c}`).join('\n') : 'nothing to write');
}

function verify() {
  const errors = [];
  const fail = (invariant, message) => errors.push(`${invariant}  ${message}`);
  const { items, files } = derived();

  // I1 – the lock regenerates byte-identically.
  if (read(LOCK) !== files[LOCK]) fail('I1', 'registry.lock.json is not what sync would write: run `npm run sync`');
  if (read(CLAUDE_MD) !== files[CLAUDE_MD]) fail('I1', 'CLAUDE.md generated block is out of date: run `npm run sync`');

  // I2 – content changed ⇒ version bumped, against the base ref.
  const base = option('--base') ?? process.env.KIT_BASE ?? (git(['rev-parse', '--verify', 'origin/main']) ? 'origin/main' : null);
  const baseLockText = base ? git(['show', `${base}:registry.lock.json`]) : null;
  if (baseLockText) {
    const baseLock = JSON.parse(baseLockText);
    const current = JSON.parse(files[LOCK]);
    for (const item of current.items) {
      const before = baseLock.items.find((b) => b.path === item.path);
      if (before && item.version && before.hash !== item.hash && before.version === item.version) {
        fail('I2', `${item.path} changed but its version is still ${item.version}`);
      }
    }
    for (const plugin of current.plugins) {
      const before = baseLock.plugins.find((b) => b.name === plugin.name);
      if (before && before.hash !== plugin.hash && before.version === plugin.version) {
        fail('I2', `plugin ${plugin.name} changed but plugin.json version is still ${plugin.version} (users would keep the cached copy)`);
      }
    }
  } else {
    console.log(`I2  skipped: no base lock found${base ? ` at ${base}` : ''}`);
  }

  // I3 – every contract copy equals its source.
  for (const [file, content] of Object.entries(files)) {
    if (isCoreCopy(file) && read(file) !== content) fail('I3', `${rel(file)} differs from packs/kit-core/contracts/${path.basename(file)}`);
  }

  // I4 – closed world: every referenced contract, skill and command exists.
  const contracts = new Set(items.filter((i) => i.kind === 'contract').map((i) => i.name));
  const skills = new Set(items.filter((i) => i.kind === 'skill').map((i) => i.name));
  const commands = new Set(items.filter((i) => i.kind === 'command').map((i) => i.name));
  const allExternal = new Set(Object.values(EXTERNAL_SKILLS).flat());
  const external = (pack) => (pack === 'kit-core' ? allExternal : new Set(EXTERNAL_SKILLS[pack] ?? []));
  const toolFiles = stackPacks().flatMap((p) => list(path.join(PACKS, p, 'tools'), (f) => f.endsWith('.mjs')).map((f) => ({ pack: p, path: rel(f), text: read(f) })));
  for (const item of [...items, ...toolFiles]) {
    for (const m of item.text.matchAll(/kit contract ([a-z0-9-]+)/g)) {
      if (!contracts.has(m[1])) fail('I4', `${item.path} references unknown contract "${m[1]}"`);
    }
    for (const m of item.text.matchAll(/`([a-z0-9-]+)` skill/g)) {
      if (!skills.has(m[1]) && !external(item.pack).has(m[1])) fail('I4', `${item.path} references unknown skill "${m[1]}"`);
    }
    for (const m of item.text.matchAll(/`\/([a-z0-9-]+)`/g)) {
      if (!commands.has(m[1])) fail('I4', `${item.path} references unknown command "/${m[1]}"`);
    }
  }

  // I5 – counts of kit parts only in generated files.
  const handWritten = [
    ['README.md', read(path.join(ROOT, 'README.md')) ?? ''],
    ['CLAUDE.md (hand-written part)', (read(CLAUDE_MD) ?? '').split(GEN_START)[0]],
    ['packs/kit-core/methodology.md', read(path.join(PACKS, 'kit-core', 'methodology.md')) ?? ''],
  ];
  for (const [name, text] of handWritten) {
    const m = /\b\d+\s+(skills?|contracts?|commands?|plugins?|scanners?)\b/i.exec(text);
    if (m) fail('I5', `${name} contains a hand-written count "${m[0]}"; counts belong in the generated inventory`);
  }

  // I6 – shape.
  for (const item of items) {
    if (item.kind === 'skill') {
      const dir = path.basename(path.dirname(item.path));
      if (item.meta.name !== dir) fail('I6', `${item.path}: name "${item.meta.name}" must equal its folder "${dir}"`);
      const description = item.meta.description ?? '';
      if (!description) fail('I6', `${item.path}: missing description`);
      if (/[<>]/.test(description)) fail('I6', `${item.path}: description must not contain angle brackets`);
      if (description.length > 1024) fail('I6', `${item.path}: description longer than 1024 characters`);
      if (!item.version) fail('I6', `${item.path}: missing metadata.version`);
      if (!item.meta.metadata?.kind) fail('I6', `${item.path}: missing metadata.kind`);
    }
    if (item.kind === 'contract') {
      if (item.meta.name !== path.basename(item.path, '.md')) fail('I6', `${item.path}: name must equal the file name`);
      for (const key of ['version', 'kind', 'status', 'incident', 'applies-when']) {
        if (!item.meta[key]) fail('I6', `${item.path}: missing "${key}" in frontmatter`);
      }
      for (const heading of ['## Failure class', '## How to diagnose', '## What to do']) {
        if (!item.text.includes(heading)) fail('I6', `${item.path}: missing section "${heading}"`);
      }
    }
    if (item.kind === 'command') {
      if (!item.meta.description) fail('I6', `${item.path}: missing description`);
      for (const heading of ['## When', '## Steps', '## Verify', '## Rollback']) {
        if (!item.text.includes(heading)) fail('I6', `${item.path}: missing section "${heading}"`);
      }
    }
  }

  // I6 – shape of the manifests: every plugin is listed, every dependency can be resolved.
  const marketplace = JSON.parse(read(MARKETPLACE));
  const listed = new Set(marketplace.plugins.map((p) => p.name));
  const allowed = new Set(marketplace.allowCrossMarketplaceDependenciesOn ?? []);
  for (const pack of packs()) {
    const manifest = JSON.parse(read(path.join(PACKS, pack, '.claude-plugin', 'plugin.json')));
    if (manifest.name !== pack) fail('I6', `packs/${pack}: plugin.json name "${manifest.name}" must equal the folder`);
    if (!listed.has(pack)) fail('I6', `packs/${pack} is not listed in .claude-plugin/marketplace.json`);
    for (const dep of manifest.dependencies ?? []) {
      if (typeof dep === 'string' && !listed.has(dep)) fail('I6', `${pack} depends on "${dep}", which is not in this marketplace`);
      if (typeof dep === 'object' && dep.marketplace && !allowed.has(dep.marketplace)) {
        fail('I6', `${pack} depends on ${dep.name}@${dep.marketplace}, but that marketplace is not in allowCrossMarketplaceDependenciesOn`);
      }
    }
  }

  if (errors.length) {
    console.log(errors.join('\n'));
    console.log(`\nverify failed: ${errors.length} problem(s)`);
    process.exit(1);
  }
  console.log('verify passed (I1–I6). CI also checks I7: a second sync writes nothing.');
}

function create() {
  const [kind, name] = args.slice(1);
  const pack = option('--pack') ?? (kind === 'command' ? stackPacks()[0] : 'kit-core');
  if (!['contract', 'skill', 'command'].includes(kind) || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name ?? '')) {
    console.error(`usage: new <contract|skill|command> <kebab-name> [--pack ${packs().join('|')}]`);
    process.exit(2);
  }
  if (!packs().includes(pack)) {
    console.error(`unknown pack "${pack}". Known: ${packs().join(', ')}`);
    process.exit(2);
  }
  const target = {
    contract: path.join(PACKS, pack, 'contracts', `${name}.md`),
    skill: path.join(PACKS, pack, 'skills', name, 'SKILL.md'),
    command: path.join(PACKS, pack, 'commands', `${name}.md`),
  }[kind];
  if (fs.existsSync(target)) {
    console.error(`${rel(target)} already exists`);
    process.exit(1);
  }
  const templates = {
    contract: `---\nname: ${name}\nversion: 0.1.0\nkind: contract\npack: ${pack}\nstatus: draft\nincident: TODO name the incident\napplies-when: TODO the trigger the router shows\n---\n\n# ${name}\n\n## Failure class\n\nTODO (use the contract-author skill)\n\n## How to diagnose\n\nTODO\n\n## What to do\n\nTODO\n`,
    skill: `---\nname: ${name}\ndescription: TODO what it does and every situation it should trigger in.\nmetadata:\n  version: 0.1.0\n  kind: TODO\n---\n\n# ${name}\n\nTODO\n`,
    command: `---\ndescription: TODO one line\n---\n\n# ${name}\n\n## When\n\nTODO\n\n## Steps\n\nTODO\n\n## Verify\n\nTODO\n\n## Rollback\n\nTODO\n`,
  };
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, templates[kind]);
  console.log(`created ${rel(target)}`);
  if (kind === 'contract') console.log('next: run the contract-author skill to fill it, then `npm run sync`');
}
