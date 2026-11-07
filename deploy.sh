#!/usr/bin/env bash
# Build the site and publish dist/ to the `site` branch (Hostinger pulls this branch into public_html).
set -euo pipefail
npm ci --silent || npm install --silent
# npm test  (e2e: see tools/README.md)
npx astro build
TMP=$(mktemp -d)
cp -r dist/. "$TMP"/
git rev-parse HEAD > "$TMP/deployed-commit.txt"
# GitHub job that pings IndexNow (Bing etc.) after each publish
mkdir -p "$TMP/.github/workflows" && cp tools/github/indexnow.yml "$TMP/.github/workflows/indexnow.yml"
# Keep previous builds' hashed assets so pages cached in browsers/CDN never lose their CSS/JS
if git fetch -q origin site 2>/dev/null; then
  git archive FETCH_HEAD _astro 2>/dev/null | tar -x -C "$TMP" --skip-old-files 2>/dev/null || true
fi
git -C "$TMP" init -q -b site
git -C "$TMP" add -A
git -C "$TMP" -c user.name="ZentaPDF" -c user.email="santaji.gade@gmail.com" commit -q -m "Publish site $(date -u +%Y-%m-%dT%H:%MZ)"
# In GitHub Actions, reuse the checkout's token for the push (no effect when run locally)
AUTH=$(git config --get-regexp '^http\..*\.extraheader$' 2>/dev/null | head -1 | cut -d' ' -f2- || true)
if [ -n "$AUTH" ]; then git -C "$TMP" -c http.extraheader="$AUTH" push -q -f "$(git remote get-url origin)" site:site
else git -C "$TMP" push -q -f "$(git remote get-url origin)" site:site; fi
echo "Published to branch 'site'."
