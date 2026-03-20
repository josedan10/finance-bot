#!/bin/bash

# Set the dockerfile path based on the param
if [ "$#" -eq 0 ]; then
  echo "Usage: deploy.sh <deploy_mode> (local|production)"
  exit 1
fi

echo "Cleaning docker system"
docker system prune -af
echo "Done!"

# Free port 5001 if already in use
echo "Freeing port 5001..."
lsof -i :5001 -t | xargs kill -9 &> /dev/null || true

mode=$1

if [ "$mode" == "local" ]; then
  # Build the docker image
  echo "Building docker image..."
  npm run docker:build-dev

  # Start the docker container
  echo "Starting docker container..."
  npm run docker:start-dev

  # Wait for container to be ready
  echo "Waiting for container to be ready..."
  sleep 5
elif [ "$mode" == "production" ]; then
  # Build the docker image
  echo "Building docker image..."
  npm run docker:build

  # Start the docker container
  echo "Starting docker container..."
  npm run docker:start

  # Wait for container to be ready
  echo "Waiting for container to be ready..."
  sleep 5
else
  echo "Invalid deploy mode. Usage: deploy.sh <deploy_mode> (local|production)"
  exit 1
fi

# Run the Prisma migration
echo "Running Prisma migration..."
if [ "$mode" == "local" ]; then
  npm run docker:migrations-local
  npm run docker:migrations-dev-local
else
  npm run docker:migrations
  npm run docker:migrations-dev
fi

# Print the deployment status
echo "Deployment successful!"
