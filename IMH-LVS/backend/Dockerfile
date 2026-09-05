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
RUN mkdir -p uploads

# The platform's own $PORT (Render/Railway/Fly all set this) takes
# precedence — see src/config/env.ts. 4000 is only the local-dev default.
EXPOSE 4000

CMD ["node", "dist/server.js"]
