# syntax=docker/dockerfile:1
# Builds the static export (including the self-hosted OCR, background-removal and AVIF assets
# that `npm run build` prepares) and serves it with scripts/serve.mjs, which applies the
# route-specific headers from vercel.json. Do not swap the final stage for a generic static
# server unless you reproduce those headers.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Sitemap URLs; set to your own origin: docker build --build-arg SITE_URL=https://tools.example.com .
ARG SITE_URL
ENV SITE_URL=${SITE_URL}
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=4173
COPY --from=build /app/out ./out
COPY scripts/serve.mjs ./scripts/serve.mjs
COPY vercel.json ./vercel.json
USER node
EXPOSE 4173
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/" || exit 1
CMD ["node", "scripts/serve.mjs"]
