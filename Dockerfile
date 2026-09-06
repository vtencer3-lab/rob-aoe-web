# Sestavení pro Coolify na jouki.cz. Jeden kontejner obsluhuje API i sestavený
# frontend; migrace proběhnou při startu, takže „git push“ je celé nasazení.
#
# BASE_PATH je cesta, pod kterou web veřejně běží (`/aoe/`, `/aoe/dev/`).
# Musí sedět s BASE_URL za běhu — Vite podle ní staví adresy assetů a API,
# server podle BASE_URL staví přesměrování a cookie. Coolify ji předává jako
# build ARG z proměnné označené „build time“.

# -------- 1. Sestavení backendu i frontendu --------
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY web/package.json web/package-lock.json ./web/
# --include=dev schválně: Coolify vkládá NODE_ENV=production i do buildu
# a bez toho by chyběl tsc i vite.
RUN npm ci --include=dev && npm --prefix web ci --include=dev
COPY . .
ARG BASE_PATH=/
ENV BASE_PATH=$BASE_PATH
RUN npm run build

# -------- 2. Jen runtime závislosti --------
FROM node:24-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# -------- 3. Běh --------
FROM node:24-alpine AS runner
# curl kvůli healthchecku, který Coolify do kontejneru vkládá sám.
RUN apk add --no-cache curl
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/web/dist ./web/dist
COPY package.json ./
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:3000/api/health > /dev/null || exit 1
# Migrace před startem: dist/scripts/migrate.js čte dist/database, kam je
# npm run build zkopíroval.
CMD ["sh", "-c", "node dist/scripts/migrate.js && node dist/src/main.js"]
