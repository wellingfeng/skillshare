import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

/** Paths excluded from scanning, sizing, fingerprinting, and bundling. */
export const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "build",
  ".turbo",
  "__pycache__",
  ".venv",
  ".pytest_cache",
]);

export const IGNORED_FILES = new Set([".DS_Store", "Thumbs.db"]);

export interface WalkedFile {
  /** Path relative to the skill root, using forward slashes. */
  relPath: string;
  absPath: string;
  size: number;
}

function isIgnored(name: string): boolean {
  return IGNORED_DIRS.has(name) || IGNORED_FILES.has(name);
}

/**
 * Recursively walk a skill directory, skipping ignored paths. Symlinked
 * directories are not followed (their target is recorded separately) to avoid
 * pulling in massive shared trees and to prevent symlink cycles.
 */
export async function walkSkillDir(root: string): Promise<WalkedFile[]> {
  const out: WalkedFile[] = [];

  async function recurse(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (isIgnored(entry.name)) continue;
      const abs = join(dir, entry.name);

      if (entry.isSymbolicLink()) {
        // Record the link as a zero-byte marker; do not traverse it.
        out.push({
          relPath: toPosix(relative(root, abs)),
          absPath: abs,
          size: 0,
        });
        continue;
      }
      if (entry.isDirectory()) {
        await recurse(abs);
      } else if (entry.isFile()) {
        const s = await stat(abs);
        out.push({
          relPath: toPosix(relative(root, abs)),
          absPath: abs,
          size: s.size,
        });
      }
    }
  }

  await recurse(root);
  return out;
}

function toPosix(p: string): string {
  return p.split(sep).join("/");
}

/**
 * Deterministic sha256 fingerprint of a skill's content. Files are sorted by
 * relative path, and each contributes `relPath\0sha256(content)\n` so that
 * identical content yields an identical hash regardless of scan order or
 * absolute location. Large files (>2MB) are hashed by content too, since
 * fingerprint stability matters more than speed here.
 */
export async function fingerprintSkill(
  root: string,
  files?: WalkedFile[],
): Promise<{ hash: string; sizeBytes: number; fileCount: number }> {
  const walked = files ?? (await walkSkillDir(root));
  const sorted = [...walked].sort((a, b) => a.relPath.localeCompare(b.relPath));

  const top = createHash("sha256");
  let sizeBytes = 0;

  for (const f of sorted) {
    sizeBytes += f.size;
    let fileHash = "";
    if (f.size > 0) {
      const buf = await readFile(f.absPath);
      fileHash = createHash("sha256").update(buf).digest("hex");
    }
    top.update(f.relPath);
    top.update("\0");
    top.update(fileHash);
    top.update("\n");
  }

  return {
    hash: top.digest("hex"),
    sizeBytes,
    fileCount: sorted.length,
  };
}
