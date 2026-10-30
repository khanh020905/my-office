#!/bin/sh
# A stand-in for cloudflared in the end-to-end tests (OFFICE_TUNNEL_CMD): prints the address a quick tunnel prints, then
# stays up like the real one until it is stopped. Nothing goes out to the internet.
echo "INF |  https://e2e-office-test.trycloudflare.com  |" >&2
exec sleep 3600
