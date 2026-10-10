FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/shared-types/package.json ./packages/shared-types/package.json
COPY packages/validation/package.json ./packages/validation/package.json
RUN npm install

COPY . .
RUN npm --workspace @afrochef/api run prisma:generate
RUN npm --workspace @afrochef/api run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NODE_PATH=/app/apps/api/node_modules

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/packages/shared-types ./packages/shared-types
COPY --from=builder /app/packages/validation ./packages/validation

RUN npm install --omit=dev

EXPOSE 3000
CMD ["npm", "--workspace", "@afrochef/api", "run", "start:prod"]
