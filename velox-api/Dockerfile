# ----------------------------
# Stage 1: The Builder
# ----------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Install openssl so Prisma generate can run
RUN apk add --no-cache openssl

# Install dependencies (including devDependencies for TypeScript + prisma CLI)
COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma/
RUN npm ci

# Generate Prisma Client in builder stage (has full npm + openssl available)
# binaryTargets in schema.prisma includes linux-musl-arm64-openssl-3.0.x
# so the correct engine binary is downloaded here for the final image.
RUN DATABASE_URL="postgresql://dummy:dummy@localhost/dummy" npx prisma generate

# Copy source code and compile TypeScript -> dist/
COPY src ./src
RUN npm run build

# ----------------------------
# Stage 2: The Production Runner
# ----------------------------
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Install openssl3 so Prisma's linux-musl-arm64-openssl-3.0.x engine can load
RUN apk add --no-cache openssl

# Copy package.json and install production deps
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --omit=dev

# Copy the generated Prisma Client (both @prisma types and .prisma native engine)
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Copy built TypeScript output
COPY --from=builder /app/dist ./dist

# Don't run as root (Security Best Practice)
USER node

# Expose the port Cloud Run expects
EXPOSE 8080

# Start the server (tsconfig rootDir="./" so output is dist/src/server.js)
CMD ["node", "dist/src/server.js"]
