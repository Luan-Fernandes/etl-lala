# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# ⚡ Configurações de memória Node.js
ENV NODE_OPTIONS="--expose-gc --max-old-space-size=2048"

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package*.json ./

# Comando padrão pode ser sobrescrito pelo docker-compose
CMD ["node", "--expose-gc", "--max-old-space-size=2048", "dist/main.js"]
