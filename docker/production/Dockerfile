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

ARG TARGETARCH

ENV NODE_ENV=production
ENV PORT=5000

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package*.json ./

RUN SHARP_CPU="${TARGETARCH}" \
	&& if [ "$SHARP_CPU" = "amd64" ]; then SHARP_CPU="x64"; fi \
	&& npm prune --omit=dev --ignore-scripts \
	&& npm install --no-save --include=optional --os=linux --cpu=${SHARP_CPU} sharp@0.34.4 \
	&& npm cache clean --force

EXPOSE 5000

CMD ["npm", "run", "start"]
