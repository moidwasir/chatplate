#!/usr/bin/env bash
# Vercel build for the API (see vercel.json). Runs from apps/api.
set -euo pipefail

# Shared workspace packages the API imports from their dist/
(cd ../.. && pnpm --filter @safi/types build && pnpm --filter @safi/whatsapp build)

pnpm prisma generate
# Migrations need a direct (unpooled) connection; Neon provides one
DATABASE_URL="${DATABASE_URL_UNPOOLED:-$DATABASE_URL}" pnpm prisma migrate deploy
pnpm build

# Vercel requires a non-empty output directory; this also keeps the API out of search engines
mkdir -p public
printf 'User-agent: *\nDisallow: /\n' > public/robots.txt
