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
# what the office looks at to know it has background sessions (server/bg-sessions.mjs): the real ones' words
if [ "$1" = --version ]; then echo "2.1.316 (Claude Code)"; exit 0; fi
if [ "$1" = --help ]; then
  echo "Usage: claude [options] [command] [prompt]"
  echo "  --bg, --background                    Start the session in the background and return immediately."
  echo "  -p, --print                           Print response and exit"
  echo "Commands:"
  echo "  agents [options]                      Manage background agents"
  echo "  attach <id|name>                      Open a background session in this terminal."
  exit 0
fi
# background sessions (`claude --bg`, `claude agents --json`, `claude stop`): each one a folder in ~/.fake-bg with its
# row, and a little process that does what the real session's hooks would do, posting to the office
BG="$HOME/.fake-bg"; OFFICE="http://127.0.0.1:$OFFICE_PORT"
row() { printf '{"id":"%s","cwd":"%s","kind":"background","startedAt":%s,"sessionId":"%s","name":"%s","state":"%s"%s}' "$1" "$PWD" "$(date +%s)000" "$2" "$1" "$3" "$4" > "$BG/$1.json"; }
if [ "$1" = agents ]; then
  printf '['; first=1; for f in "$BG"/*.json; do [ -f "$f" ] || continue; [ $first = 1 ] || printf ','; first=0; cat "$f"; done; echo ']'
  exit 0
fi
if [ "$1" = stop ]; then
  [ -f "$BG/$2.json" ] || { echo "No job matching '$2'. Run 'claude agents' to list running sessions."; exit 1; }
  if [ -f "$BG/$2.pid" ]; then p=$(cat "$BG/$2.pid"); pkill -P "$p" 2>/dev/null; kill "$p" 2>/dev/null; rm -f "$BG/$2.pid"; fi
  sid=$(sed 's/.*"sessionId":"\([^"]*\)".*/\1/' "$BG/$2.json"); row "$2" "$sid" stopped ""
  echo "stopped $2"; exit 0
fi
if [ "$1" = --bg ]; then
  mkdir -p "$BG"; printf '%s\n' "$*" >> "$HOME/.fake-claude.log"
  prompt=""; seen=0; resume=""; prev=""
  for a in "$@"; do if [ $seen = 1 ]; then prompt="$a"; elif [ "$a" = -- ]; then seen=1; elif [ "$prev" = --resume ]; then resume="$a"; fi; prev="$a"; done
  case "$prompt" in *untrusted*) echo "Workspace not trusted. Run \`claude\` in $PWD once and accept the trust prompt, then retry." >&2; exit 1 ;; esac
  id=$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n'); sid=${resume:-"e2e-bg-$id"}
  for f in "$BG"/*.json; do [ -f "$f" ] && grep -q "\"sessionId\":\"$sid\"" "$f" && id=$(basename "$f" .json); done   # (carried on: the same one)
  row "$id" "$sid" working ',"pid":1,"status":"busy"'
  (
    post() { curl -s -m 2 -o /dev/null -H 'Content-Type: application/json' -H "X-Office-Job: $id" --data-binary "$2" "$OFFICE$1"; }
    ev() { post /event "{\"session_id\":\"$sid\",\"cwd\":\"$PWD\",\"hook_event_name\":\"$1\"$2}"; }
    post /hook/bind "{\"session_id\":\"$sid\",\"cwd\":\"$PWD\",\"hook_event_name\":\"SessionStart\",\"source\":\"startup\"}"
    ev SessionStart ',"source":"startup"'; ev UserPromptSubmit ",\"prompt\":\"$prompt\""
    sleep 1; ev PreToolUse ',"tool_name":"Read","tool_input":{"file_path":"/e2e/README.md"}'
    said="Done in the background."
    case "$prompt" in *approval*)
      req="{\"session_id\":\"$sid\",\"cwd\":\"$PWD\",\"hook_event_name\":\"PermissionRequest\",\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"npm run e2e-bg\"}}"
      # both its hooks, as the real one runs them: the usual one (answered at once) and the office's own, that waits
      short=$(curl -s -m 50 -H 'Content-Type: application/json' --data-binary "$req" "$OFFICE/hook/permission"); printf 'short=[%s]\n' "$short" >> "$BG/$id.hooks"
      got=$(curl -s -m 300 -H 'Content-Type: application/json' --data-binary "$req" "$OFFICE/hook/permission?long=1"); printf 'long=%s\n' "$got" >> "$BG/$id.hooks"
      case "$got" in *'"allow"'*) said="Done in the background: allowed." ;; *) said="Done in the background: not allowed." ;; esac ;;
    esac
    case "$prompt" in *slowly*) sleep 25 ;; esac
    ev Stop ",\"last_assistant_message\":\"$said\""
    row "$id" "$sid" done ""; rm -f "$BG/$id.pid"
  ) >/dev/null 2>&1 </dev/null &
  echo $! > "$BG/$id.pid"
  echo "backgrounded · $id"
  echo "  claude agents             list sessions"
  echo "  claude attach $id    open in this terminal"
  exit 0
fi
# `claude -p …` (a task given from the office, server/tasks.mjs): its stream, a new session and its last words
case " $* " in *" -p "*)
  printf '%s\n' "$*" >> "$HOME/.fake-claude.log"   # (what it was asked to resume, for the tests to read)
  echo '{"type":"system","subtype":"init","session_id":"e2e-task-1"}'
  echo '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","input":{"file_path":"/e2e/README.md"}}]}}'
  sleep 1
  case " $* " in *"slowly"*) sleep 25 ;; esac   # (long enough to be stopped from its card)
  case " $* " in
    *"with a picture"*) printf '{"type":"result","subtype":"success","is_error":false,"result":"**Done**, with:\\n- one change\\n- and `code`\\nSCREENSHOT: http://127.0.0.1:%s/health"}\n' "$OFFICE_PORT" ;;
    *) echo '{"type":"result","subtype":"success","is_error":false,"result":"Done: the e2e task."}' ;;
  esac
  exit 0 ;;
esac
exit 1
