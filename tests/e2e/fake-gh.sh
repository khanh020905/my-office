#!/bin/sh
# A stand-in for GitHub's gh in the end-to-end tests (GH_PATH): `gh run list`, run in a repository, answers with what
# the test wrote for it in $FAKE_GH_DIR/<the repository's folder name>.json (nothing written: no runs); a release
# list is empty; anything else fails, as gh does offline.
case "$1 $2" in
  "run list") cat "$FAKE_GH_DIR/$(basename "$PWD").json" 2>/dev/null || echo '[]' ;;
  "release list") echo '[]' ;;
  *) exit 1 ;;
esac
