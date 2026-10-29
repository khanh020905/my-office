#!/bin/sh
# A stand-in for Claude Code's CLI in the end-to-end tests (OFFICE_CLAUDE_BIN): `claude auth login` prints the sign-in
# link the real one prints, then "signs in" a moment later (an account in the folder's .claude.json). No browser.
if [ "$1" = auth ] && [ "$2" = login ]; then
  echo "Opening browser to sign in…"
  echo "If the browser didn't open, visit: https://claude.com/cai/oauth/authorize?code=true&e2e=1"
  sleep 6   # (long enough for the card to show the waiting step on a busy machine)
  printf '{"oauthAccount":{"accountUuid":"e2e","organizationUuid":"e2e"}}' > "$CLAUDE_CONFIG_DIR/.claude.json"
  echo "Login successful."
  exit 0
fi
exit 1
