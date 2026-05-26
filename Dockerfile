# ═══════════════════════════════════════════════════
# Hecate — Dockerfile
# Multi-stage: Node.js build → nginx static serve (HTTPS)
# ═══════════════════════════════════════════════════

# ── Stage 1: Build ──────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install deps first (layer cache).
# `npm ci` uses package-lock.json as the source of truth — reproducible builds.
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY . .

# VITE_MYTHIC_HOST can be injected at build time:
#   docker build --build-arg MYTHIC_HOST=10.0.0.1:7443 .
ARG MYTHIC_HOST=localhost:7443
ENV VITE_MYTHIC_HOST=${MYTHIC_HOST}

RUN npm run build

# ── Stage 2: Serve ──────────────────────────────────
FROM nginx:alpine AS runtime

# openssl needed for self-signed cert generation at startup
RUN apk add --no-cache openssl

# Remove default nginx page
RUN rm -rf /usr/share/nginx/html/*

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Nginx config — HTTPS, SPA fallback + proxy to Mythic backend
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Entrypoint generates self-signed cert if /etc/nginx/ssl is empty
COPY nginx/docker-entrypoint.sh /docker-entrypoint.d/40-hecate-ssl.sh
RUN chmod +x /docker-entrypoint.d/40-hecate-ssl.sh

EXPOSE 443

CMD ["nginx", "-g", "daemon off;"]
