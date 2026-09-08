# Stage 1: build the static bundle. --ignore-scripts skips `prepare`, which points
# git's hooksPath at .githooks and needs a git checkout the image does not have.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json vite.config.ts index.html ./
# vite.config.ts generates the service worker from scripts/lib at build time.
COPY scripts/lib/service-worker.ts ./scripts/lib/
COPY public/ ./public/
COPY src/ ./src/
# Stamped onto the title screen so a phone can say which build it runs.
ARG BUILD_SHA=unknown
ARG BUILD_NUMBER=0
ENV BUILD_SHA=$BUILD_SHA BUILD_NUMBER=$BUILD_NUMBER
RUN npm run build

# Stage 2: nginx serves dist/. No Node at runtime; the game has no backend.
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
