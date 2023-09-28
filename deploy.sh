#!/bin/bash

# Build the docker image
echo "Building docker image..."
npm run docker:build

# Start the docker container
echo "Starting docker container..."
npm run docker:start

# Run the Prisma migration
echo "Running Prisma migration..."
docker-compose exec express-api-bot npx prisma migrate dev

# Print the deployment status
echo "Deployment successful!"