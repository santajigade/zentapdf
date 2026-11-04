#!/usr/bin/env bash
# Build the site and publish dist/ to the `site` branch (Hostinger pulls this branch into public_html).
set -euo pipefail
npm ci --silent || npm install --silent
# npm test  (e2e: see tools/README.md)
npx astro build
TMP=$(mktemp -d)
cp -r dist/. "$TMP"/
# GitHub job that pings IndexNow (Bing etc.) after each publish
mkdir -p "$TMP/.github/workflows" && cp tools/github/indexnow.yml "$TMP/.github/workflows/indexnow.yml"
# Keep previous builds' hashed assets so pages cached in browsers/CDN never lose their CSS/JS
if git fetch -q origin site 2>/dev/null; then
  git archive FETCH_HEAD _astro 2>/dev/null | tar -x -C "$TMP" --skip-old-files 2>/dev/null || true
fi
git -C "$TMP" init -q -b site
git -C "$TMP" add -A
git -C "$TMP" -c user.name="ZentaPDF" -c user.email="santaji.gade@gmail.com" commit -q -m "Publish site $(date -u +%Y-%m-%dT%H:%MZ)"
git -C "$TMP" push -q -f "$(git remote get-url origin)" site:site
echo "Published to branch 'site'."
