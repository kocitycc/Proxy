FROM node:lts-alpine

WORKDIR /opt/proxy

COPY package.json package-lock.json* ./
RUN apk add --no-cache python3 openssl && npm ci

COPY . .
RUN npx prisma generate && npm run build

CMD ["node", "dist/index.js"]
