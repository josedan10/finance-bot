#!/bin/bash

# Set the dockerfile path based on the param
if [ "$#" -eq 0 ]; then
  echo "Usage: deploy.sh <deploy_mode> (local|production)"
  exit 1
fi

echo "Cleaning docker system"
docker system prune -af
echo "Done!"


mode=$1

if [ "$mode" == "local" ]; then
  # Build the docker image
  echo "Building docker image..."
  npm run docker:build-dev

  # Start the docker container
  echo "Starting docker container..."
  npm run docker:start-dev
elif [ "$mode" == "production" ]; then
  # Build the docker image
  echo "Building docker image..."
  npm run docker:build

  # Start the docker container
  echo "Starting docker container..."
  npm run docker:start
else
  echo "Invalid deploy mode. Usage: deploy.sh <deploy_mode> (local|production)"
  exit 1
fi

# Run the Prisma migration
echo "Running Prisma migration..."
npm run docker:migrations
npm run docker:migrations-dev

# Print the deployment status
echo "Deployment successful!"
