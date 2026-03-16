# 👁 visibility-doctor

A developer and SRE CLI/TUI for quickly sweeping the visibility app stack during incidents. Not a replacement for Dynatrace or Azure Insights — this tool **samples key layers in seconds** to help narrow down where a problem likely exists so you know where to look next.

---

## Prerequisites

| Tool              | Why | Install                                                                       |
|-------------------|---|-------------------------------------------------------------------------------|
| Node.js ≥ 22      | Runtime | [nodejs.org](https://nodejs.org)                                              |
| Google Chrome     | Page load check + login flow | [google.com/chrome](https://www.google.com/chrome)                            |

---

## Installation

**Repo must be cloned:**
```sh
npm install && npm run build && npm link       # builds + links `vdoc` to your PATH
```

---

## Quick start

```sh
npm run                                   # show all available commands
npm run sweep                             # launch the interactive TUI
npm run login                             # open browser to capture your session
npm run login -- --env [prod|staging]     # login to a specific env
npm run check -- [akamai|auth|page|ping]  # run a single check layer (auth, akamai, ping, page)  
npm run config                            # list configured environments
npm run config:path                       # print the config file location
npm run config:edit                       # open it in your $EDITOR
npm run build                             # compile TypeScript → dist/
npm run dev                               # watch mode
npm run typecheck                         # type-check without building
npm run link                              # build + npm link (makes local `vdoc` resolve to your build)
```

On first run, a default config is written to `~/.config/vis-doc/config.json`. Edit that file to add your real URLs before sweeping.

---

### Config

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

| Field | Required | Description                                                                                                        |
|---|---|--------------------------------------------------------------------------------------------------------------------|
| `loginUrl` | ✓ | The FedEx.com login page URL. Chrome opens here during `vdoc login`.                                               |
| `baseUrl` | ✓ | The app URL to sweep (ping + page load checks run against this).                                                   |
| `cookieNames` | ✓ | Cookie names to watch for during login — signals that login is complete. All cookies are captured, not just these. |

---

## Check layers

| Layer | Tool | What it checks |
|---|---|---|
| **Auth** | session file | Is the stored session valid and not expired? |
| **Akamai Edge** | HTTP | Is the CDN/WAF in front? DNS timing, edge latency, cache status, WAF block detection |
| **Ping** | HTTP (no auth) | Is the app deployed? Server up? Not 404/5xx? |
| **Page Load** | Real Chrome + cookies | Does the page fully load in a real browser? Did auth hold (no redirect to login)? Reports TTFB, FCP, LCP, and total load time. |

**Page load summary format:**

```
ttfb: 0.21s, fcp: 0.85s,  window.load: 2.34s, lcp: 1.10s
```

| Metric          | Description |
|-----------------|---|
| **TTFB**        | Time to First Byte — how quickly the server responds |
| **FCP**         | First Contentful Paint — when the browser renders the first visible content |
| **LCP**         | Largest Contentful Paint — when the main content is visible |
| **window.load** | Wall-clock time until the browser `load` event fires |

**Total load time thresholds** (determine check status):

| Time | Status |
|---|---|
| ≤ 3s | GOOD ✓ |
| 3–5s | SLOW △ |
| > 5s | POOR ✗ |

---

## How auth works

1. Run `npm run login` — Chrome opens as a plain OS process (no automation flags, invisible to ForgeRock)
2. Log in manually in the browser window
3. `vdoc` polls for the signal cookies defined in `cookieNames`
4. Once detected, **all** session cookies are captured (typically 30–40) and saved encrypted to `~/.config/vis-doc/sessions/<env>.json`
5. Subsequent sweeps inject these cookies into checks that need auth

Sessions are encrypted with AES-256-GCM. The key is stored at `~/.config/vis-doc/.secret` (mode 0600, never committed).

---

## Roadmap

- [ ] AKS pod health check (`kubectl`)
- [ ] Traefik ingress health check
- [ ] Dynatrace anomaly feed
- [ ] MFE route checks (`/visibility`, `/monitor`, `/overview`, `/detail`)
- [ ] GraphQL / REST endpoint sampling
