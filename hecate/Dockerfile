# ═══════════════════════════════════════════════════
# Hecate — Dockerfile
# Multi-stage: Node.js build → nginx static serve
# ═══════════════════════════════════════════════════

# ── Stage 1: Build ──────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install deps first (layer cache)
COPY package.json ./
RUN npm install

# Copy source and build
COPY . .

# VITE_MYTHIC_HOST can be injected at build time:
#   docker build --build-arg MYTHIC_HOST=10.0.0.1:7443 .
ARG MYTHIC_HOST=localhost:7443
ENV VITE_MYTHIC_HOST=${MYTHIC_HOST}

RUN npm run build

# ── Stage 2: Serve ──────────────────────────────────
FROM nginx:alpine AS runtime

# Remove default nginx page
RUN rm -rf /usr/share/nginx/html/*

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Nginx config — SPA fallback + proxy to Mythic backend
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
