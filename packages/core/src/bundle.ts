import { create, extract } from "tar";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IGNORED_DIRS } from "./fingerprint.js";

/**
 * Per-skill compressed-bundle size limits, by account plan. The limit applies
 * to the gzipped .tar.gz (the actual stored/transferred size), not the
 * uncompressed directory.
 */
export const FREE_MAX_BUNDLE_BYTES = 20 * 1024 * 1024; // 20 MB (free tier)
export const PRO_MAX_BUNDLE_BYTES = 200 * 1024 * 1024; // 200 MB (paid tier)

/** Account plans that affect upload limits. */
export type Plan = "free" | "pro";

/** Max compressed bundle size (bytes) allowed for a given plan. */
export function planBundleLimit(plan: Plan): number {
  return plan === "pro" ? PRO_MAX_BUNDLE_BYTES : FREE_MAX_BUNDLE_BYTES;
}

/**
 * Pack a skill directory into a gzipped tar, excluding ignored paths
 * (.git, node_modules, ...). Returns the raw bytes.
 */
export async function packSkill(skillDir: string): Promise<Buffer> {
  const tmp = join(tmpdir(), `skillshare-${Date.now()}.tar.gz`);
  try {
    await create(
      {
        gzip: true,
        file: tmp,
        cwd: skillDir,
        // Exclude ignored directories anywhere in the tree.
        filter: (path) => {
          const segments = path.split("/");
          return !segments.some((s) => IGNORED_DIRS.has(s));
        },
      },
      ["."],
    );
    return await readFile(tmp);
  } finally {
    await rm(tmp, { force: true });
  }
}

/** Pack a skill and return a base64 string suitable for JSON transport / DB. */
export async function packSkillBase64(skillDir: string): Promise<{
  base64: string;
  byteSize: number;
}> {
  const buf = await packSkill(skillDir);
  return { base64: buf.toString("base64"), byteSize: buf.byteLength };
}

/**
 * Extract a gzipped tar bundle into a destination directory, creating it if
 * needed. Used by `install` to materialize a downloaded skill.
 */
export async function unpackSkill(
  bundle: Buffer,
  destDir: string,
): Promise<void> {
  await mkdir(destDir, { recursive: true });
  const tmp = join(tmpdir(), `skillshare-extract-${Date.now()}.tar.gz`);
  try {
    await writeFile(tmp, bundle);
    await extract({ file: tmp, cwd: destDir });
  } finally {
    await rm(tmp, { force: true });
  }
}

export async function unpackSkillBase64(
  base64: string,
  destDir: string,
): Promise<void> {
  await unpackSkill(Buffer.from(base64, "base64"), destDir);
}
