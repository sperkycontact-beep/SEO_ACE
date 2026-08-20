#!/usr/bin/env bash
# SEO ACE - instalacia lokalneho MCP servera (macOS / Linux)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
CONF_DIR="$HOME/.seo-ace"

echo "SEO ACE — instalacia lokalneho MCP servera"
echo "=========================================="

if ! command -v node >/dev/null 2>&1; then
  echo "CHYBA: Node.js nie je nainstalovany. Nainstaluj Node 20+ z https://nodejs.org" >&2
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "CHYBA: Node $NODE_MAJOR je prilis stary, treba 20+." >&2
  exit 1
fi
echo "  Node $(node -v) OK"

mkdir -p "$CONF_DIR"
chmod 700 "$CONF_DIR"

if [ ! -f "$CONF_DIR/gsc-client.json" ]; then
  cat > "$CONF_DIR/gsc-client.json" <<'JSON'
{
  "_comment": "Vyplnte client_id a client_secret z Google Cloud Console -> APIs & Services -> Credentials -> Create OAuth client ID -> Desktop app. V projekte zapnite 'Google Search Console API'.",
  "client_id": "",
  "client_secret": ""
}
JSON
  chmod 600 "$CONF_DIR/gsc-client.json"
  echo "  Vytvoreny $CONF_DIR/gsc-client.json — treba doplnit OAuth udaje"
else
  echo "  $CONF_DIR/gsc-client.json uz existuje"
fi

echo ""
echo "Selftest servera:"
node "$HERE/selftest.mjs"

echo ""
echo "Registracia v Claude Code:"
if command -v claude >/dev/null 2>&1; then
  claude mcp add seo-ace -- node "$HERE/index.mjs" 2>/dev/null \
    && echo "  Zaregistrovane ako 'seo-ace'." \
    || echo "  Uz zaregistrovane alebo pridaj rucne (nizsie)."
else
  echo "  Claude Code CLI sa nenaslo. Pridaj rucne do ~/.claude.json:"
fi
cat <<JSON

  "mcpServers": {
    "seo-ace": {
      "command": "node",
      "args": ["$HERE/index.mjs"]
    }
  }
JSON

echo ""
echo "Dalsi krok: doplnte OAuth udaje do $CONF_DIR/gsc-client.json,"
echo "potom v Claude Code spustite nastroj gsc_login."
