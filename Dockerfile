# syntax=docker/dockerfile:1

###############################################
# Stage 1: Dependencies (full deps for build) #
###############################################
FROM node:20-alpine AS deps
# Prisma cần openssl & libc6-compat trên alpine
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

###############################################
# Stage 2: Build                              #
###############################################
FROM node:20-alpine AS build
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Sinh Prisma Client rồi build NestJS
RUN npx prisma generate
RUN npm run build

# Loại bỏ devDependencies để node_modules gọn cho production
RUN npm prune --omit=dev

###############################################
# Stage 3: Runtime                            #
###############################################
FROM node:20-alpine AS runtime
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

ENV NODE_ENV=production
# Lưu ý: KHÔNG hardcode PORT. Render sẽ tự inject biến PORT lúc runtime,
# app đọc process.env.PORT nên sẽ listen đúng cổng Render cấp.

# Chạy bằng user non-root có sẵn trong image node
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/package.json ./package.json

USER node

# EXPOSE chỉ mang tính tài liệu; Render tự phát hiện cổng từ biến PORT.
EXPOSE 3000

# Health: cả Postgres và Redis phải connected (xem GET /api/health).
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Áp dụng migration trước khi khởi động app.
# Nếu muốn tách riêng, có thể bỏ "prisma migrate deploy" ở đây
# và đặt nó vào Pre-Deploy Command trên Render (khuyến nghị khi scale >1 replica).
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
