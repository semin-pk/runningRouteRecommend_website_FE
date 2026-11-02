FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY route-agent/frontend/package.json route-agent/frontend/package-lock.json ./route-agent/frontend/
RUN npm ci --include=dev --include=optional --no-audit --no-fund
RUN npm --prefix route-agent/frontend ci --include=dev --include=optional --no-audit --no-fund

COPY index.html vite.config.js ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts
COPY route-agent/frontend/index.html route-agent/frontend/vite.config.js ./route-agent/frontend/
COPY route-agent/frontend/src ./route-agent/frontend/src

ENV VITE_KAKAO_JS_KEY=test-public-map-key
RUN node --test scripts/configure-amplify-agent.test.mjs
RUN npm run build
RUN node scripts/configure-amplify-agent.mjs
