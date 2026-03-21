#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"

if [[ ! -f "$ENV_FILE" ]]; then
	echo "Missing production environment file: $ENV_FILE"
	exit 1
fi

required_env_vars=(
	MYSQL_ROOT_PASSWORD
	TELEGRAM_BOT_TOKEN
	NEXT_PUBLIC_FIREBASE_API_KEY
	NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
	NEXT_PUBLIC_FIREBASE_PROJECT_ID
	NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
	NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
	NEXT_PUBLIC_FIREBASE_APP_ID
)

set -a
source "$ENV_FILE"
set +a

for required_env_var in "${required_env_vars[@]}"; do
	if [[ -z "${!required_env_var:-}" ]]; then
		echo "Missing required environment variable in $ENV_FILE: $required_env_var"
		exit 1
	fi
done

mkdir -p "$ROOT_DIR/traefik"
touch "$ROOT_DIR/traefik/acme.json"
chmod 600 "$ROOT_DIR/traefik/acme.json"

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build --remove-orphans

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T zentra-api-production npx prisma migrate deploy

echo "Production deployment completed successfully."
