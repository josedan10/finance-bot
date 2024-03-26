# Use a lighter base image
FROM node:18 as deps

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json for npm install
COPY package*.json ./

# Install dependencies, skipping dev dependencies and scripts
RUN npm install

# Copy the rest of the application code
FROM node:18 as builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . ./
RUN npx prisma generate
RUN npm run build

FROM node:18 as runner
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/.env ./
RUN npm install --omit=dev --ignore-scripts
RUN npm install @prisma/client
# Expose the port
EXPOSE 5000

# Command to run the application
CMD ["npm", "run", "start"]
