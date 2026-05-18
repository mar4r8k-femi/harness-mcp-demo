# syntax=docker/dockerfile:1.6

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --prefer-offline --no-audit --no-fund

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

FROM node:20-alpine AS runtime
ARG GIT_SHA=dev
ENV GIT_SHA=${GIT_SHA}
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --prefer-offline --no-audit --no-fund \
 && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
