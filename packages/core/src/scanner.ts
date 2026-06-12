import { homedir } from "node:os";
import { join } from "node:path";
import { lstat, readdir, readFile, stat } from "node:fs/promises";
import matter from "gray-matter";
import type { ScannedSkill, SourceTool } from "./types.js";
import { fingerprintSkill, walkSkillDir } from "./fingerprint.js";

/**
 * A scan source describes where one tool keeps its skills. Adding support for
 * a new tool (openclaw, a future CLI, ...) is just another entry here.
 */
export interface ScanSource {
  tool: SourceTool;
  /** Absolute directory that contains one subdirectory per skill. */
  dir: string;
}

/** Default skill locations, resolved against the user's home directory. */
export function defaultScanSources(home = homedir()): ScanSource[] {
  return [
    { tool: "claude", dir: join(home, ".claude", "skills") },
    { tool: "agents", dir: join(home, ".agents", "skills") },
    { tool: "codex", dir: join(home, ".codex", "skills") },
    { tool: "openclaw", dir: join(home, ".openclaw", "skills") },
  ];
}

async function dirExists(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.isDirectory();
  } catch {
    return false;
  }
}

/** Parse name/description/version from a skill's SKILL.md frontmatter. */
async function readSkillMeta(
  skillDir: string,
): Promise<{ description?: string; version?: string; name?: string }> {
  for (const fname of ["SKILL.md", "skill.md", "README.md"]) {
    const p = join(skillDir, fname);
    try {
      const raw = await readFile(p, "utf8");
      const parsed = matter(raw);
      const data = parsed.data as Record<string, unknown>;
      const description =
        typeof data.description === "string"
          ? data.description.trim().replace(/\s+/g, " ").slice(0, 500)
          : undefined;
      return {
        name: typeof data.name === "string" ? data.name : undefined,
        description,
        version: typeof data.version === "string" ? data.version : undefined,
      };
    } catch {
      // try next candidate
    }
  }
  return {};
}

/** Scan a single source directory into ScannedSkill records. */
export async function scanSource(source: ScanSource): Promise<ScannedSkill[]> {
  if (!(await dirExists(source.dir))) return [];

  const entries = await readdir(source.dir, { withFileTypes: true });
  const results: ScannedSkill[] = [];

  for (const entry of entries) {
    // A skill is a directory (or a symlink pointing to one).
    const abs = join(source.dir, entry.name);
    let isSymlink = entry.isSymbolicLink();
    let isDir = entry.isDirectory();

    if (isSymlink) {
      try {
        const target = await stat(abs); // follows the link
        isDir = target.isDirectory();
      } catch {
        continue; // broken symlink
      }
    }
    if (!isDir) continue;

    try {
      const files = await walkSkillDir(abs);
      // Skip directories that hold no real files (empty / only ignored).
      if (files.length === 0) continue;

      const { hash, sizeBytes, fileCount } = await fingerprintSkill(abs, files);
      const meta = await readSkillMeta(abs);

      results.push({
        name: meta.name ?? entry.name,
        path: abs,
        sourceTool: source.tool,
        description: meta.description,
        version: meta.version,
        contentHash: hash,
        sizeBytes,
        fileCount,
        isSymlink,
      });
    } catch {
      // Unreadable skill dir — skip rather than fail the whole scan.
    }
  }

  return results;
}

export interface ScanOptions {
  sources?: ScanSource[];
  /** Extra directories to scan, e.g. project-local `.claude/skills`. */
  extraDirs?: ScanSource[];
}

/**
 * Scan all configured sources. Skills with the same content hash from multiple
 * locations (e.g. a symlink and its target) are de-duplicated, preferring the
 * non-symlink entry.
 */
export async function scanAll(opts: ScanOptions = {}): Promise<ScannedSkill[]> {
  const sources = [
    ...(opts.sources ?? defaultScanSources()),
    ...(opts.extraDirs ?? []),
  ];

  const all: ScannedSkill[] = [];
  for (const src of sources) {
    all.push(...(await scanSource(src)));
  }

  const byHash = new Map<string, ScannedSkill>();
  for (const skill of all) {
    const existing = byHash.get(skill.contentHash);
    if (!existing || (existing.isSymlink && !skill.isSymlink)) {
      byHash.set(skill.contentHash, skill);
    }
  }
  return [...byHash.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Human-readable size, e.g. "1.4 MB". */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}
