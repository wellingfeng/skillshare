---
name: shareskill
description: |
  Collect every AI coding skill installed on this machine (Claude Code, Codex,
  openclaw, ~/.agents, and local originals), detect which are public vs. your
  own work, and share the ones you pick as short links on SkillShare.
  Use when the user says "shareskill", "share my skills", "/shareskill", or
  wants to publish/collect skills for sharing.
allowed-tools:
  - Bash
---

# /shareskill

Run the SkillShare CLI to collect and share skills from this machine.

## Language (do this first)

Before anything else, detect the user's system language and use it for the rest
of this skill run when talking to the user:

```bash
node -e "process.stdout.write(Intl.DateTimeFormat().resolvedOptions().locale)" 2>/dev/null || echo "$LANG"
```

- If the locale starts with `zh` (e.g. `zh-CN`, `zh_CN.UTF-8`) → speak to the
  user in 简体中文 for all explanations, prompts, and summaries in this run.
- Otherwise → reply in the language that locale indicates (e.g. `ja` → 日本語,
  `es` → Español, `fr` → Français, `de` → Deutsch). Fall back to English if the
  locale is English or can't be determined.

This only changes the language *you* (the assistant) use with the user. The
CLI's own printed output (spinners, "Found N skills", auth prompts) stays as-is.

## What it does

1. Scans all known skill directories on the machine.
2. Calls the SkillShare backend to classify each skill:
   - **public** — found on GitHub / the web, marked safe to share (metadata only).
   - **original** — found nowhere online, likely the user's own work, pinned to
     the top of the list and flagged "maybe built by you".
3. Shows an interactive checklist to pick what to share.
4. Authorizes the CLI against the user's account (device-code flow) the first
   time, caching the token in `~/.config/skillshare`.
5. Uploads selections (full content for originals, metadata + link for public
   skills) and prints short share links + a QR code.

## How to run

Preview what's installed (no account needed):

```bash
npx @skillshare/cli scan
```

Collect and share:

```bash
npx @skillshare/cli share
```

Install a skill someone shared with you (diffs against your local skills first):

```bash
npx @skillshare/cli install <code>
```

Set `SKILLSHARE_URL` to point at a self-hosted instance (defaults to
`http://localhost:3000`).
