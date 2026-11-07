#!/bin/sh
# A stand-in for cloudflared in the end-to-end tests (OFFICE_TUNNEL_CMD): prints the address a quick tunnel prints, then
# stays up like the real one until it is stopped. Nothing goes out to the internet.
# A named tunnel (a fixed address, server/index.mjs setTunnelDomain): Cloudflare's login, the tunnel, its DNS name, and
# running it, all in the test's own home folder; nothing goes out.
CF="$HOME/.cloudflared"
case "$*" in
  "tunnel login"*) mkdir -p "$CF"; echo fake > "$CF/cert.pem"; echo "INF You have successfully logged in." >&2; exit 0 ;;
  "tunnel list"*) if [ -f "$CF/fake-id" ]; then printf '[{"id":"%s","name":"my-office"}]\n' "$(cat "$CF/fake-id")"; else echo "[]"; fi; exit 0 ;;
  "tunnel create"*) id=11111111-2222-3333-4444-555555555555; echo "$id" > "$CF/fake-id"; echo '{}' > "$CF/$id.json"; echo "Created tunnel my-office with id $id"; exit 0 ;;
  "tunnel route dns"*) echo "INF Added CNAME which will route to this tunnel" >&2; exit 0 ;;
  *" run "*) echo "INF Registered tunnel connection connIndex=0" >&2; exec sleep 3600 ;;
esac
# With FAKE_REVOKE (a file) present: an address that Cloudflare takes back at once, as the real one logs it; the file goes,
# so the next start is a healthy one with the usual address.
if [ -n "$FAKE_REVOKE" ] && [ -f "$FAKE_REVOKE" ]; then
  rm -f "$FAKE_REVOKE"
  echo "INF |  https://e2e-revoked.trycloudflare.com  |" >&2
  echo "INF Registered tunnel connection connIndex=0" >&2
  sleep 2
  echo 'ERR Register tunnel error from server side error="Unauthorized: Tunnel not found" connIndex=0' >&2
  exec sleep 3600
fi
echo "INF |  https://e2e-office-test.trycloudflare.com  |" >&2
exec sleep 3600
