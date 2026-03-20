FROM node:22

WORKDIR /app/finance-bot

COPY finance-bot/package.json ./

RUN npm install

COPY finance-bot/ .
RUN npx prisma generate

EXPOSE 5001

CMD [ "npm", "run", "dev"]