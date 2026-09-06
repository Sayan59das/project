# Multi-stage build for the IMH LVS backend.
#
# Uses a Debian-based (not Alpine) Node image deliberately: `sharp`'s
# prebuilt binaries and glibc compatibility are far more reliable on
# Debian/glibc than on Alpine/musl, avoiding a native-compile step.
# poppler-utils (providing `pdftoppm`) is installed via apt in the runtime
# stage — it's required for the scanned/image-only PDF OCR path (see
# src/services/pdf.service.ts); everything else (JPG OCR, PDF text-layer
# extraction) works without it.

FROM node:22-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends poppler-utils \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# SQL migrations and seeds are data files, not TypeScript, so they are not
# in dist/ — they have to be copied in separately or `npm run db:migrate`
# has nothing to apply in the deployed container. dist/db/migrate.js
# resolves them relative to itself (../../db/migrations), which lands here.
COPY db ./db

RUN mkdir -p uploads

# Applying migrations in a deployment
# -----------------------------------
# `npm run db:migrate` runs the TypeScript source via tsx, which is a
# devDependency and therefore absent from this image. Use the compiled
# output instead:
#
#   node dist/db/migrate.js && node dist/db/seed.js
#
# On Render that belongs in the service's "Pre-Deploy Command" so it runs
# once per deploy, before the new instance starts taking traffic — not in
# CMD, which would race every replica against the same migration.

# The platform's own $PORT (Render/Railway/Fly all set this) takes
# precedence — see src/config/env.ts. 4000 is only the local-dev default.
EXPOSE 4000

CMD ["node", "dist/server.js"]
