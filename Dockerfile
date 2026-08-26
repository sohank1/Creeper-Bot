# syntax=docker/dockerfile:1

FROM node:22-bookworm

ARG TARGETARCH

RUN apt-get update \
    && apt-get install -y \
        chromium \
        fonts-liberation \
        ca-certificates \
        xdg-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
ENV PUPPETEER_SKIP_DOWNLOAD=true
# Keep both the npm download cache and one exact, architecture-specific
# node_modules tree on the BuildKit builder. npm ci remains the safe fallback
# when the dependency key changes or the builder cache was pruned.
RUN --mount=type=cache,id=creeper-bot-npm,target=/root/.npm,sharing=locked \
    --mount=type=cache,id=creeper-bot-node-modules-node22-linux-${TARGETARCH},target=/var/cache/creeper-bot-node-modules,sharing=locked \
    set -eu; \
    dependency_key="$$( { node -e 'const fs=require("fs"); const pkg=JSON.parse(fs.readFileSync("package.json")); const lock=JSON.parse(fs.readFileSync("package-lock.json")); if (lock.packages && lock.packages[""]) { delete lock.packages[""].name; delete lock.packages[""].version; } console.log(JSON.stringify({manifest:{dependencies:pkg.dependencies||{},devDependencies:pkg.devDependencies||{},optionalDependencies:pkg.optionalDependencies||{},peerDependencies:pkg.peerDependencies||{},overrides:pkg.overrides||{}},lock}));'; printf 'node=%s\nnpm=%s\n' "$$(node --version)" "$$(npm --version)"; } | sha256sum | awk '{print $$1}' )"; \
    cache_entry="/var/cache/creeper-bot-node-modules/current"; \
    if [ -f "$$cache_entry/READY" ] \
        && [ -d "$$cache_entry/node_modules" ] \
        && grep -Fqx "$$dependency_key" "$$cache_entry/READY"; then \
        echo "Using cached node_modules for dependency key $$dependency_key"; \
        cp -a "$$cache_entry/node_modules" ./node_modules; \
    else \
        echo "Installing node_modules for dependency key $$dependency_key"; \
        npm ci --prefer-offline --no-audit --no-fund; \
        temp_entry="/var/cache/creeper-bot-node-modules/.tmp-$$$$"; \
        rm -rf "$$temp_entry"; \
        mkdir -p "$$temp_entry"; \
        cp -a ./node_modules "$$temp_entry/node_modules"; \
        printf '%s\n' "$$dependency_key" > "$$temp_entry/READY"; \
        rm -rf "$$cache_entry"; \
        mv "$$temp_entry" "$$cache_entry"; \
    fi

COPY . .
RUN git config --global --add safe.directory /app
RUN npm run build

EXPOSE 3001

ENV NODE_ENV=production
ENV HOST_TYPE=oracle
ENV PORT=3001
ENV GOOGLE_CHROME_BIN=/usr/bin/chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

CMD ["node", "dist/index.js"]
