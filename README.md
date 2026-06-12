# SkillShare CLI

Collect, detect, and share your AI coding skills (Claude Code, Codex, openclaw, and your own local skills) via short links.

You may have dozens of skills installed locally across different AI coding tools. Many are public (already on GitHub), some are your own original work. Sharing them one by one — with their descriptions, workflows, and scripts — is painful. SkillShare makes it one command.

```bash
npx @skillshare/cli share          # scan, detect, pick, upload -> get a short link
npx @skillshare/cli install x7Kp2  # open a shared link, diff against local, install what's missing
```

> This is the **open-source CLI + core library**. The backend service (website, API, database) lives in a separate private repository. Point the CLI at any compatible server with the `SKILLSHARE_URL` environment variable.

## How it works

1. **Scan** your machine for skills across multiple tools (`~/.claude/skills`, `~/.agents/skills`, `~/.codex/skills`, `~/.openclaw/skills`).
2. **Detect origin** — skills already on GitHub / the public web are marked `✅ safe to share`. Skills not found anywhere are flagged `★ original — maybe built by you` and pinned to the top.
3. **Upload** — public skills share only metadata + a link; original skills upload the full content as a gzipped bundle (`.git`/`node_modules` excluded).
4. **Short link** — every share becomes a base62 short code (`/s/x7Kp2`) you can post anywhere.

## Commands

```bash
skillshare scan              # preview the skills found on this machine (no account needed)
skillshare share             # scan, detect, pick, and share — prints short links + a QR code
skillshare install <code>    # install a shared skill, diffing against your local skills first
skillshare logout            # clear the cached auth token
```

## Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `SKILLSHARE_URL` | `https://skillshare.app` | Backend server base URL. Set this to your self-hosted instance. |

The CLI caches its auth token in `~/.config/skillshare/config.json` (mode `0600`).

## Monorepo layout

```
skillshare/
├── packages/core/     # scanning, parsing, fingerprinting, bundling, short codes
├── packages/cli/      # @skillshare/cli — the command-line tool
└── skills/shareskill/ # the /shareskill skill definition (SKILL.md)
```

## Development

```bash
pnpm install
pnpm build
node packages/cli/dist/index.js scan
```

## Security note

Skills can contain executable scripts. The `install` flow shows you the skill's details and tells you to review its contents before running anything. Always inspect a downloaded skill before executing its scripts.

## License

MIT — see [LICENSE](./LICENSE).
