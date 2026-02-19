# velox-web/Dockerfile — React / Vite frontend
#
# Two-stage build:
#   1. builder  — node:20-alpine, runs `vite build` with VITE_* args baked in
#   2. runner   — nginx:alpine, serves the static bundle with SPA fallback
#
# VITE_* env vars are build-time arguments — they get compiled into the JS
# bundle by Vite and cannot be changed at runtime.  Pass them via docker-compose
# build.args or docker build --build-arg.

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install deps first (layer-cached independently of source changes)
COPY package*.json ./
RUN npm ci

# Accept VITE_* build-time args — these are baked into the static bundle
ARG VITE_API_URL=http://localhost:8080
ARG VITE_CLERK_PUBLISHABLE_KEY
ARG VITE_STRIPE_PUBLISHABLE_KEY

# Make them available as env vars for the vite build process
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_STRIPE_PUBLISHABLE_KEY=$VITE_STRIPE_PUBLISHABLE_KEY

COPY . .
RUN npm run build

# ── Stage 2: Serve with nginx ─────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runner

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# SPA-friendly nginx config:
#   - Serve static files from /usr/share/nginx/html
#   - Fall back to index.html for any unknown path (React Router)
#   - Cache static assets aggressively; no-cache on index.html
COPY --from=builder /app/dist /usr/share/nginx/html

RUN cat > /etc/nginx/conf.d/velox.conf << 'EOF'
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Cache static assets (JS, CSS, images, fonts) for 1 year
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # Never cache the HTML entry point (SPA shell)
    location / {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        try_files $uri $uri/ /index.html;
    }

    # Gzip text assets
    gzip on;
    gzip_types text/plain text/css application/javascript application/json;
    gzip_min_length 256;
}
EOF

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
