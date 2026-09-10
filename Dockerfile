# syntax=docker/dockerfile:1

FROM node:22-bookworm

RUN apt-get update \
    && apt-get install -y \
        chromium \
        xvfb \
        x11-utils \
        fonts-liberation \
        fonts-noto-color-emoji \
        ca-certificates \
        xdg-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
ENV PUPPETEER_SKIP_DOWNLOAD=true
# Keep npm's package download cache on the BuildKit builder while always
# installing a clean dependency tree for the image.
RUN --mount=type=cache,id=creeper-bot-npm,target=/root/.npm,sharing=locked \
    npm ci --prefer-offline --no-audit --no-fund

COPY . .
RUN git config --global --add safe.directory /app
RUN npm run build
COPY docker-entrypoint.sh /usr/local/bin/creeper-bot-entrypoint
RUN chmod 755 /usr/local/bin/creeper-bot-entrypoint

EXPOSE 3001

ENV NODE_ENV=production
ENV HOST_TYPE=oracle
ENV PORT=3001
ENV GOOGLE_CHROME_BIN=/usr/bin/chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV FORTNITE_SPRITE_BROWSER_HEADFUL=true

CMD ["/usr/local/bin/creeper-bot-entrypoint", "node", "dist/index.js"]
