FROM node:22 AS deps

WORKDIR /app

COPY package*.json ./
RUN npm ci

FROM node:22 AS builder
WORKDIR /app

ENV NODE_OPTIONS=--max-old-space-size=1536

COPY --from=deps /app/node_modules ./node_modules
COPY . ./

RUN npx prisma generate
RUN npm run build

FROM node:22 AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package*.json ./

RUN npm ci --omit=dev --ignore-scripts \
	&& npm cache clean --force

COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

EXPOSE 5000

CMD ["npm", "run", "start"]
