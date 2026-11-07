#!/bin/sh
# A stand-in for cloudflared in the end-to-end tests (OFFICE_TUNNEL_CMD): prints the address a quick tunnel prints, then
# stays up like the real one until it is stopped. Nothing goes out to the internet.
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
