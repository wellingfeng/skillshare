/** The tool that produced a skill, used both for scanning and install targets. */
export type SourceTool = "claude" | "codex" | "openclaw" | "agents" | "other";

/** Origin classification from the detection service. */
export type Origin = "public" | "original" | "unknown";

/** A skill discovered on the local machine before any detection runs. */
export interface ScannedSkill {
  /** Skill folder name (e.g. "autoplan"). */
  name: string;
  /** Absolute path to the skill directory on disk. */
  path: string;
  /** Which tool's skill directory this came from. */
  sourceTool: SourceTool;
  /** Parsed from SKILL.md frontmatter when present. */
  description?: string;
  version?: string;
  /** sha256 over the normalized content of the skill (see fingerprint.ts). */
  contentHash: string;
  /** Total size of the skill directory in bytes, excluding ignored paths. */
  sizeBytes: number;
  /** Number of files (excluding ignored paths). */
  fileCount: number;
  /** True when the directory is a symlink to a shared location. */
  isSymlink: boolean;
}

/** Result of detecting a skill's origin. */
export interface DetectionResult {
  contentHash: string;
  origin: Origin;
  githubUrl?: string;
  /** Provider-specific match evidence, for display/debugging. */
  evidence?: unknown;
}

/** A scanned skill enriched with its detection verdict. */
export interface ClassifiedSkill extends ScannedSkill {
  origin: Origin;
  githubUrl?: string;
  /** Human label shown in the CLI list, e.g. "maybe built by claude". */
  originLabel: string;
}

/** Manifest entry for a shared skill, returned to `install`. */
export interface ShareManifestEntry {
  name: string;
  sourceTool: SourceTool;
  origin: Origin;
  description?: string;
  version?: string;
  contentHash: string;
  githubUrl?: string;
  sizeBytes: number;
  /** Short code to fetch the bundle, when origin = original. */
  shortCode: string;
}
