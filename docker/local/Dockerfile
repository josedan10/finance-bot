FROM node:18

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .
# COPY prisma/schema.prisma ./prisma
RUN npx prisma generate

# RUN npx prisma migrate dev

EXPOSE 5000

CMD [ "npm", "run", "dev"]