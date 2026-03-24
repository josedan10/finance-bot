FROM node:18 AS deps

WORKDIR /app

COPY package*.json ./
RUN npm ci

FROM node:18 AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . ./

RUN npx prisma generate
RUN npm run build

FROM node:18 AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package*.json ./

RUN npm ci --omit=dev --ignore-scripts \
	&& npm cache clean --force

EXPOSE 5000

CMD ["npm", "run", "start"]
