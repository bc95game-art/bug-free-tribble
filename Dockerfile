FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install --frozen-lockfile

# Copy source and build
COPY tsconfig.json build.mjs ./
COPY src ./src
RUN node build.mjs

# ── Production image ─────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Only install production deps
COPY package.json ./
RUN npm install --omit=dev --frozen-lockfile

# Copy build output
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/index.mjs"]
