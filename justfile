# visibility-doctor — command runner
# Run `just` to see all available commands.
# Install just: brew install just  (https://github.com/casey/just)

# Show this help list (default when you run `just` with no args)
default:
    @just --list --unsorted

prod := 'prod'

# ── Sweep ─────────────────────────────────────────────────────────────────────

# Launch the interactive TUI — prompts to pick an environment, then sweeps all layers
sweep:
    vdoc

# ── Login ─────────────────────────────────────────────────────────────────────

# Open a real browser window to log in and capture session cookies - eg. `$just login [prod]`
login env=prod:
    vdoc login --env {{env}}

# ── Single-layer checks ───────────────────────────────────────────────────────
# Run one layer at a time against the default environment.
# Available layers:
#   auth    — is the stored session valid and not expired?
#   akamai  — is the CDN/WAF edge reachable? DNS timing, cache headers, WAF blocks
#   ping    — is the app deployed and responding? (no auth needed)
#   page    — does the page fully load in a real browser, and does auth hold?

# Run a single layer check on the default env - eg. `$just check page [prod]`
check layer env=prod:
    vdoc check {{layer}} --env {{env}}

# ── Config ────────────────────────────────────────────────────────────────────

# Show all configured environments and their status
config:
    vdoc config

# Print the full path to the config file
config-path:
    vdoc config path

# Open the config file in your $EDITOR (falls back to vim)
config-edit:
    ${EDITOR:-vim} ~/.config/vis-doc/config.json

# ── Development ───────────────────────────────────────────────────────────────

# Build the project (outputs to dist/)
build:
    npm run build

# Watch mode — rebuild on every file save
dev:
    npm run dev

# Type-check without emitting files
typecheck:
    npm run typecheck

# Build and link the bin globally so `vdoc` resolves to your local build
link:
    npm run build && npm link
