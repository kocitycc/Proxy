FROM node:lts-alpine AS builder

WORKDIR /opt/proxy

COPY package.json package-lock.json* ./
RUN apk add --no-cache python3 openssl && npm ci

COPY prisma ./prisma
COPY src ./src
COPY tsconfig.json ./
RUN npx prisma generate && npm run build
RUN npm prune --omit=dev

FROM node:lts-alpine AS runtime

WORKDIR /opt/proxy

RUN apk add --no-cache openssl \
    && addgroup -S proxy \
    && adduser -S proxy -G proxy \
    && mkdir -p /opt/proxy/logs \
    && chown -R proxy:proxy /opt/proxy

COPY --from=builder --chown=proxy:proxy /opt/proxy/dist ./dist
COPY --from=builder --chown=proxy:proxy /opt/proxy/node_modules ./node_modules
COPY --from=builder --chown=proxy:proxy /opt/proxy/package*.json ./

USER proxy
CMD ["node", "dist/index.js"]
