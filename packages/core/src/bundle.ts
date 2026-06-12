import { create, extract } from "tar";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IGNORED_DIRS } from "./fingerprint.js";

/** Skills larger than this should warn the user before upload (50 MB). */
export const LARGE_SKILL_WARN_BYTES = 50 * 1024 * 1024;
/** Hard cap on bundle size for upload (100 MB). */
export const MAX_BUNDLE_BYTES = 100 * 1024 * 1024;

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
