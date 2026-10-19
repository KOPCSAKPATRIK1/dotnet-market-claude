// Loads everything the scanners read, once, so each scanner stays a pure function of the repo.
// Project files are read as text: no SDK, no restore and no build are needed, so the same scan
// runs on a developer machine, in CI and in a cloud session.
import fs from 'node:fs';
import path from 'node:path';
import { findSolutionRoot, hasBom, readJsonc, readText, toPosix, walk } from './util.mjs';

const PROJECT_FILE = /\.(cs|fs|vb)proj$/i;
const GENERATED_SOURCE = /(\.g\.cs|\.g\.i\.cs|\.Designer\.cs|AssemblyInfo\.cs|GlobalUsings\.g\.cs)$/i;
const TEST_PACKAGES = ['Microsoft.NET.Test.Sdk', 'xunit', 'xunit.v3', 'NUnit', 'MSTest', 'MSTest.TestFramework', 'TUnit'];

/** `<Name>value</Name>` pairs of every PropertyGroup; the last one wins, as in MSBuild. */
function properties(xml) {
  const props = {};
  for (const group of xml.matchAll(/<PropertyGroup\b[^>]*>([\s\S]*?)<\/PropertyGroup>/g)) {
    for (const m of group[1].matchAll(/<([A-Za-z][\w.]*)\b[^>]*>([^<]*)<\/\1>/g)) {
      props[m[1]] = m[2].trim();
    }
  }
  return props;
}

function attribute(tag, name) {
  return new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag)?.[1] ?? null;
}

/** PackageReference items with their version (attribute or child element). */
function packageReferences(xml) {
  const refs = [];
  for (const m of xml.matchAll(/<PackageReference\b([^>]*?)(?:\/>|>([\s\S]*?)<\/PackageReference>)/g)) {
    const id = attribute(m[1], 'Include') ?? attribute(m[1], 'Update');
    if (!id) continue;
    const version = attribute(m[1], 'Version') ?? attribute(m[1], 'VersionOverride')
      ?? /<Version>([^<]*)<\/Version>/.exec(m[2] ?? '')?.[1] ?? null;
    refs.push({ id, version });
  }
  return refs;
}

/** The nearest file with this name from `dir` up to `stop` (inclusive), like MSBuild's lookup. */
function nearest(dir, stop, name) {
  let current = dir;
  for (;;) {
    const candidate = path.join(current, name);
    if (fs.existsSync(candidate)) return candidate;
    if (current === stop || path.dirname(current) === current) return null;
    current = path.dirname(current);
  }
}

function solutionProjects(wsAbs, solutionFile) {
  const text = readText(path.join(wsAbs, solutionFile)) ?? '';
  const paths = solutionFile.endsWith('.slnx')
    ? [...text.matchAll(/<Project\b[^>]*\bPath\s*=\s*"([^"]+)"/g)].map((m) => m[1])
    : [...text.matchAll(/^Project\("\{[^}]+\}"\)\s*=\s*"[^"]*",\s*"([^"]+)"/gm)].map((m) => m[1]);
  return paths
    .map((p) => toPosix(path.normalize(p.replace(/\\/g, '/'))))
    .filter((p) => PROJECT_FILE.test(p) && fs.existsSync(path.join(wsAbs, p)));
}

export function loadContext(root) {
  const wsAbs = findSolutionRoot(root);
  if (!wsAbs) {
    return null;
  }
  const ws = toPosix(path.relative(root, wsAbs)) || '.';
  const allFiles = walk(wsAbs);
  const solutionFiles = allFiles.filter((f) => !f.includes('/') && /\.slnx?$/i.test(f));
  const solution = solutionFiles[0] ?? null;
  const kitConfig = readJsonc(path.join(root, '.claude', 'kit.json')) ?? {};

  const cache = new Map();
  const read = (rel) => {
    if (!cache.has(rel)) {
      cache.set(rel, readText(path.join(wsAbs, rel)) ?? '');
    }
    return cache.get(rel);
  };

  const inSolution = solution ? solutionProjects(wsAbs, solution) : [];
  const projectFiles = (inSolution.length ? inSolution : allFiles.filter((f) => PROJECT_FILE.test(f))).sort();
  const outsideSolution = solution ? allFiles.filter((f) => PROJECT_FILE.test(f) && !projectFiles.includes(f)) : [];

  const packagesProps = nearest(wsAbs, wsAbs, 'Directory.Packages.props');
  const packagesPropsText = packagesProps ? readText(packagesProps) ?? '' : '';
  const centralVersions = {};
  for (const m of packagesPropsText.matchAll(/<PackageVersion\b([^>]*?)\/?>/g)) {
    const id = attribute(m[1], 'Include');
    if (id) centralVersions[id] = attribute(m[1], 'Version');
  }
  const cpm = /<ManagePackageVersionsCentrally>\s*true\s*</i.test(packagesPropsText);

  const projects = projectFiles.map((file) => {
    const xml = read(file);
    const dir = path.posix.dirname(file);
    const absDir = path.join(wsAbs, dir);
    const buildProps = nearest(absDir, wsAbs, 'Directory.Build.props');
    const props = { ...(buildProps ? properties(readText(buildProps) ?? '') : {}), ...properties(xml) };
    const sdk = /<Project\b[^>]*\bSdk\s*=\s*"([^"]+)"/.exec(xml)?.[1] ?? 'none';
    const packages = packageReferences(xml).map((p) => ({ ...p, version: p.version ?? centralVersions[p.id] ?? null }));
    const references = [...xml.matchAll(/<ProjectReference\b[^>]*\bInclude\s*=\s*"([^"]+)"/g)]
      .map((m) => toPosix(path.posix.normalize(path.posix.join(dir, m[1].replace(/\\/g, '/')))));
    const lock = readJsonc(path.join(absDir, 'packages.lock.json'));
    const frameworks = (props.TargetFrameworks ?? props.TargetFramework ?? '').split(';').map((s) => s.trim()).filter(Boolean);
    const isTest = props.IsTestProject === 'true' || packages.some((p) => TEST_PACKAGES.includes(p.id));
    return {
      name: path.posix.basename(file).replace(PROJECT_FILE, ''),
      file,
      dir: dir === '.' ? '' : dir,
      xml,
      sdk,
      props,
      packages,
      references,
      lock,
      frameworks,
      isTest,
      rootNamespace: props.RootNamespace || path.posix.basename(file).replace(PROJECT_FILE, ''),
    };
  });

  const projectOf = (file) => {
    let best = null;
    for (const p of projects) {
      if ((p.dir === '' || file.startsWith(p.dir + '/')) && (!best || p.dir.length > best.dir.length)) best = p;
    }
    return best;
  };

  const csFiles = allFiles.filter((f) => f.endsWith('.cs') && !GENERATED_SOURCE.test(f) && projectOf(f));
  const migrationFiles = csFiles.filter((f) => /(^|\/)Migrations\//.test(f) || /:\s*Migration\b/.test(read(f)) || /ModelSnapshot\.cs$/.test(f));
  const testFiles = csFiles.filter((f) => projectOf(f)?.isTest);
  const codeFiles = csFiles.filter((f) => !migrationFiles.includes(f) && !testFiles.includes(f));

  const deps = {};
  for (const p of projects) {
    for (const ref of p.packages) {
      (deps[ref.id] ??= new Set()).add(ref.version ?? 'unversioned');
    }
  }

  return {
    root,
    wsAbs,
    ws,
    solution,
    solutionFiles,
    projects,
    outsideSolution,
    cpm,
    centralVersions,
    globalJson: readJsonc(nearest(wsAbs, root, 'global.json') ?? ''),
    kitConfig,
    allFiles,
    csFiles,
    codeFiles,
    testFiles,
    migrationFiles,
    read,
    projectOf,
    hasBom: (rel) => hasBom(path.join(wsAbs, rel)),
    /** package id → sorted versions referenced anywhere in the solution */
    deps: Object.fromEntries(Object.entries(deps).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, [...v].sort()])),
    has(id) {
      return Boolean(this.deps[id]);
    },
    hasPrefix(prefix) {
      return Object.keys(this.deps).some((id) => id === prefix || id.startsWith(prefix + '.'));
    },
    /** Resolved version from a packages.lock.json, else the referenced version. */
    resolved(id) {
      for (const p of projects) {
        for (const graph of Object.values(p.lock?.dependencies ?? {})) {
          if (graph[id]?.resolved) return graph[id].resolved;
        }
      }
      return this.deps[id]?.[0] ?? null;
    },
    exists(rel) {
      return fs.existsSync(path.join(wsAbs, rel));
    },
    /** Files whose text matches the pattern. */
    filesMatching(pattern, files = codeFiles) {
      return files.filter((f) => pattern.test(read(f)));
    },
  };
}
