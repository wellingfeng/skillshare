import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";

export interface CliConfig {
  baseUrl: string;
  token?: string;
  userId?: string;
}

const CONFIG_DIR = join(homedir(), ".config", "skillshare");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

// Public SkillShare backend. Point at your own self-hosted server (see
// skillshare-server) by setting the SKILLSHARE_URL environment variable.
const DEFAULT_BASE_URL =
  process.env.SKILLSHARE_URL ?? "https://skillshare.app";

export async function loadConfig(): Promise<CliConfig> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<CliConfig>;
    return {
      baseUrl: parsed.baseUrl ?? DEFAULT_BASE_URL,
      token: parsed.token,
      userId: parsed.userId,
    };
  } catch {
    return { baseUrl: DEFAULT_BASE_URL };
  }
}

export async function saveConfig(config: CliConfig): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
  // Token is sensitive — restrict permissions where supported.
  try {
    await chmod(CONFIG_PATH, 0o600);
  } catch {
    /* best effort on platforms without POSIX perms */
  }
}
