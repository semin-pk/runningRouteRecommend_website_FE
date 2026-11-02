FROM node:22-bookworm-slim

WORKDIR /workspace/runningRouteRecommend_website_FE
ENV NODE_ENV=production
COPY runningRouteRecommend_website_FE/package.json runningRouteRecommend_website_FE/package-lock.json ./
COPY runningRouteRecommend_website_FE/route-agent/frontend/package.json runningRouteRecommend_website_FE/route-agent/frontend/package-lock.json ./route-agent/frontend/
RUN npm ci --include=dev --include=optional --no-audit --no-fund
RUN npm --prefix route-agent/frontend ci --include=dev --include=optional --no-audit --no-fund

COPY packages/shared /workspace/packages/shared
COPY runningRouteRecommend_website_FE/index.html runningRouteRecommend_website_FE/vite.config.js ./
COPY runningRouteRecommend_website_FE/src ./src
COPY runningRouteRecommend_website_FE/public ./public
COPY runningRouteRecommend_website_FE/scripts ./scripts
COPY runningRouteRecommend_website_FE/route-agent/frontend/index.html runningRouteRecommend_website_FE/route-agent/frontend/vite.config.js ./route-agent/frontend/
COPY runningRouteRecommend_website_FE/route-agent/frontend/src ./route-agent/frontend/src

ENV VITE_KAKAO_JS_KEY=test-public-map-key
RUN node --test scripts/configure-amplify-agent.test.mjs
RUN npm run build
