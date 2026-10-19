// Small, dependency-free helpers shared by the project-side `kit-dotnet` commands.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

/** Directories that never hold project source. */
const SKIPPED_DIRS = new Set([
  'bin', 'obj', '.vs', '.vscode', '.idea', '.git', '.claude', 'node_modules', 'packages',
  'TestResults', 'artifacts', 'publish', 'AppPackages', 'BundleArtifacts', 'coverage',
]);

export function toPosix(p) {
  return p.split(path.sep).join('/');
}

export function git(args, cwd) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

export const STACK = 'dotnet';

/** True when `dir/.claude/kit.json` is this kit's. */
export function isDotnetKitRoot(dir) {
  return readJsonc(path.join(dir, '.claude', 'kit.json'))?.stack === STACK;
}

/**
 * The folder whose .claude/ this kit owns. In a repository that also holds another stack (for
 * example an Angular app with its own kit), the git root's .claude/ is not ours, so the kit looks
 * for its own `.claude/kit.json` ("stack": "dotnet"):
 *   1. `explicit` (--root), as given;
 *   2. the nearest such folder from `start` up to the git root;
 *   3. the only such folder up to three levels below the git root (a session opened at the root);
 *   4. the git root, or `start` outside a repository.
 */
export function projectRoot(start, explicit) {
  if (explicit) {
    return path.resolve(explicit);
  }
  const from = path.resolve(start);
  const top = git(['rev-parse', '--show-toplevel'], from);
  const gitRoot = top ? path.resolve(top.trim()) : from;
  for (let dir = from; ; dir = path.dirname(dir)) {
    if (isDotnetKitRoot(dir)) return dir;
    if (dir === gitRoot || path.dirname(dir) === dir) break;
  }
  let level = [gitRoot];
  const found = [];
  for (let depth = 1; depth <= 3 && level.length; depth++) {
    const next = [];
    for (const dir of level) {
      for (const entry of safeReaddir(dir)) {
        if (entry.isDirectory() && !SKIPPED_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          next.push(path.join(dir, entry.name));
        }
      }
    }
    found.push(...next.filter(isDotnetKitRoot));
    level = next;
  }
  return found.length === 1 ? found[0] : gitRoot;
}

/**
 * Why this kit must not write into `root/.claude/`, or null when it may: the folder has a kit.json
 * of another stack. A kit.json without "stack" is an older kit-dotnet one unless its generated
 * router names no .NET tooling.
 */
export function foreignKitReason(root) {
  const config = readJsonc(path.join(root, '.claude', 'kit.json'));
  if (!config || config.stack === STACK) return null;
  if (config.stack) return `.claude/kit.json belongs to the "${config.stack}" kit-dotnet`;
  const router = readText(path.join(root, '.claude', 'conventions', '_router.md'));
  if (router && !/dotnet/i.test(router)) return '.claude/ holds the generated conventions of another kit';
  return null;
}

/**
 * Finds the .NET solution folder: the folder with a .sln or .slnx file at the root or up to three
 * levels below it; failing that, the shallowest folder with a project file. The shallowest match
 * wins, ties broken by path, so the result is stable.
 */
export function findSolutionRoot(root) {
  const isSolution = (name) => /\.slnx?$/i.test(name);
  const isProject = (name) => /\.(cs|fs|vb)proj$/i.test(name);
  for (const test of [isSolution, isProject]) {
    let level = [root];
    for (let depth = 0; depth <= 3; depth++) {
      const hits = level.filter((dir) => safeReaddir(dir).some((e) => e.isFile() && test(e.name)));
      if (hits.length > 0) {
        return hits.sort()[0];
      }
      const next = [];
      for (const dir of level) {
        for (const entry of safeReaddir(dir)) {
          if (entry.isDirectory() && !SKIPPED_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
            next.push(path.join(dir, entry.name));
          }
        }
      }
      level = next.sort();
    }
  }
  return null;
}

function safeReaddir(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** Every file below `dir` (relative, posix, sorted), skipping build output and dependencies. */
export function walk(dir, accept) {
  const out = [];
  const visit = (abs, rel) => {
    for (const entry of safeReaddir(abs)) {
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name)) {
          visit(path.join(abs, entry.name), rel ? `${rel}/${entry.name}` : entry.name);
        }
      } else if (entry.isFile()) {
        const file = rel ? `${rel}/${entry.name}` : entry.name;
        if (!accept || accept(file)) {
          out.push(file);
        }
      }
    }
  };
  visit(dir, '');
  return out.sort();
}

export function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  } catch {
    return null;
  }
}

/** Parses JSON with comments and trailing commas (global.json, launchSettings.json). Returns null on failure. */
export function readJsonc(file) {
  const text = readText(file);
  if (text === null) {
    return null;
  }
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (inString) {
      out += c;
      if (c === '\\') {
        out += next ?? '';
        i++;
      } else if (c === '"') {
        inString = false;
      }
    } else if (c === '"') {
      inString = true;
      out += c;
    } else if (c === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && next === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++;
    } else {
      out += c;
    }
  }
  try {
    return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
  } catch {
    return null;
  }
}

/** Like readText, but tells whether the file starts with a UTF-8 byte order mark. */
export function hasBom(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const buffer = Buffer.alloc(3);
    fs.readSync(fd, buffer, 0, 3, 0);
    fs.closeSync(fd);
    return buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
  } catch {
    return false;
  }
}

export function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/** Writes only when the content differs, so unchanged files keep their timestamps. */
export function writeIfChanged(file, content) {
  const current = readText(file);
  if (current === content) {
    return false;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return true;
}

/**
 * Describes a share in words instead of a count, so a committed convention doesn't change with
 * every new file. The exact numbers go to the gitignored evidence file.
 */
export function share(part, total) {
  if (total === 0 || part === 0) return 'none';
  if (part === total) return 'all';
  const ratio = part / total;
  if (ratio >= 0.8) return 'most';
  if (ratio >= 0.2) return 'some';
  return 'few';
}

/** Is an executable with this name on PATH? */
export function onPath(name) {
  const dirs = (process.env.PATH || '').split(path.delimiter);
  const exts = process.platform === 'win32'
    ? ['', ...(process.env.PATHEXT || '.EXE;.CMD;.BAT').toLowerCase().split(';')]
    : [''];
  for (const dir of dirs) {
    for (const ext of exts) {
      if (dir && fs.existsSync(path.join(dir, name + ext))) {
        return true;
      }
    }
  }
  return false;
}

/** Minimal frontmatter reader: top-level `key: value` pairs and one level of nested maps. */
export function readFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) {
    return null;
  }
  const data = {};
  let parent = null;
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const nested = /^\s+([\w-]+):\s*(.*)$/.exec(line);
    const top = /^([\w-]+):\s*(.*)$/.exec(line);
    if (top) {
      const value = stripComment(top[2]);
      if (value === '') {
        data[top[1]] = {};
        parent = top[1];
      } else {
        data[top[1]] = unquote(value);
        parent = null;
      }
    } else if (nested && parent) {
      data[parent][nested[1]] = unquote(stripComment(nested[2]));
    }
  }
  return data;
}

function stripComment(value) {
  return value.replace(/\s+#.*$/, '').trim();
}

function unquote(value) {
  return value.replace(/^["'](.*)["']$/, '$1');
}
