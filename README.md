# 👁 visibility-doctor

A developer and SRE CLI/TUI for quickly sweeping the visibility app stack during incidents. Not a replacement for Dynatrace or Azure Insights — this tool **samples key layers in seconds** to help narrow down where a problem likely exists so you know where to look next.

---

## Prerequisites

| Tool | Why | Install |
|---|---|---|
| Node.js ≥ 18 | Runtime | [nodejs.org](https://nodejs.org) |
| Google Chrome | Page load check + login flow | [google.com/chrome](https://www.google.com/chrome) |
| `just` | Command runner / cheat sheet | `brew install just` |

---

## Installation

**Via npx (no install needed):**
```sh
npx github:your-org/visibility-doctor
```

**Or install globally:**
```sh
npm install -g github:your-org/visibility-doctor
```

**For team members with the repo cloned:**
```sh
npm install
just link        # builds + links `vdoc` to your PATH
```

---

## Quick start

```sh
just             # show all available commands
just sweep       # launch the interactive TUI
just login       # open browser to capture your session
```

On first run, a default config is written to `~/.config/vis-doc/config.json`. Edit that file to add your real URLs before sweeping.

---

## Config

All state lives in `~/.config/vis-doc/`. You can edit, diff, and share configs freely.

```sh
just config-path   # print the config file location
just config-edit   # open it in your $EDITOR
```

**Config shape** (`~/.config/vis-doc/config.json`):

```json
{
  "defaultEnv": "prod",
  "envs": {
    "prod": {
      "name": "Production",
      "loginUrl": "https://your-app.example.com/secure-login",
      "baseUrl": "https://your-app.example.com/your-route",
      "cookieNames": ["session", "token"]
    }
  }
}
```

| Field | Required | Description |
|---|---|---|
| `loginUrl` | ✓ | The ForgeRock login page URL. Chrome opens here during `vdoc login`. |
| `baseUrl` | ✓ | The app URL to sweep (ping + page load checks run against this). |
| `cookieNames` | ✓ | Cookie names to watch for during login — signals that login is complete. All cookies are captured, not just these. |

---

## Commands

### TUI (interactive)

```sh
just sweep                  # pick an env and sweep all layers interactively
just sweep-env prod         # sweep a specific env, skip the picker
```

### Login

```sh
just login                  # open Chrome to log in (default env)
just login-env staging      # log in to a specific env
```

Chrome opens as a normal (non-automated) browser window. Log in manually. Once the session cookies are detected, the browser closes and the session is saved encrypted to `~/.config/vis-doc/sessions/`.

### Single-layer checks

Run one check at a time — useful when you already know the problem area:

```sh
just check auth             # is the stored session valid and not expired?
just check akamai           # is the CDN/WAF edge healthy? DNS, cache, WAF blocks
just check ping             # is the app deployed and returning 200?
just check page             # does the page fully load? does auth hold?

just check-env page staging # same checks, specific env
```

### Config

```sh
just config                 # list configured environments
just config-path            # print config file path
just config-edit            # open config in $EDITOR
```

---

## Check layers

| Layer | Tool | What it checks |
|---|---|---|
| **Auth** | session file | Is the stored session valid and not expired? |
| **Akamai Edge** | HTTP | Is the CDN/WAF in front? DNS timing, edge latency, cache status, WAF block detection |
| **Ping** | HTTP (no auth) | Is the app deployed? Server up? Not 404/5xx? |
| **Page Load** | Real Chrome + cookies | Does the page fully load in a real browser? Did auth hold (no redirect to login)? How fast? |

**Page load thresholds:**

| Time | Status |
|---|---|
| ≤ 3s | GOOD ✓ |
| 3–5s | SLOW △ |
| > 5s | POOR ✗ |

---

## How auth works

1. Run `just login` — Chrome opens as a plain OS process (no automation flags, invisible to ForgeRock)
2. Log in manually in the browser window
3. `vdoc` polls for the signal cookies defined in `cookieNames`
4. Once detected, **all** session cookies are captured (typically 30–40) and saved encrypted to `~/.config/vis-doc/sessions/<env>.json`
5. Subsequent sweeps inject these cookies into checks that need auth

Sessions are encrypted with AES-256-GCM. The key is stored at `~/.config/vis-doc/.secret` (mode 0600, never committed).

---

## Development

```sh
just build        # compile TypeScript → dist/
just dev          # watch mode
just typecheck    # type-check without building
just link         # build + npm link (makes local `vdoc` resolve to your build)
```

---

## Roadmap

- [ ] AKS pod health check (`kubectl`)
- [ ] Traefik ingress health check
- [ ] Dynatrace anomaly feed
- [ ] MFE route checks (`/visibility`, `/monitor`, `/overview`, `/detail`)
- [ ] GraphQL / REST endpoint sampling
