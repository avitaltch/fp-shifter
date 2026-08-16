FROM node:22-alpine AS dependencies

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY migrations ./migrations
COPY scripts ./scripts
COPY --from=build /app/dist ./dist

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health/live').then((response) => { if (!response.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["node", "dist/main.js"]
