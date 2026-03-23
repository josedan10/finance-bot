#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
RESOLVED_ENV_FILE=""

if [[ ! -f "$ENV_FILE" ]]; then
	echo "Missing production environment file: $ENV_FILE"
	exit 1
fi

cleanup() {
	if [[ -n "$RESOLVED_ENV_FILE" && -f "$RESOLVED_ENV_FILE" ]]; then
		rm -f "$RESOLVED_ENV_FILE"
	fi
}

trap cleanup EXIT

contains_1password_references() {
	grep -q 'op://' "$1"
}

require_1password_cli() {
	if ! command -v op >/dev/null 2>&1; then
		echo "1Password CLI ('op') is required when using op:// secret references."
		exit 1
	fi
}

resolve_env_file() {
	local source_env_file="$1"

	if ! contains_1password_references "$source_env_file"; then
		echo "$source_env_file"
		return
	fi

	require_1password_cli

	if [[ -z "${OP_SERVICE_ACCOUNT_TOKEN:-}" && -z "${OP_CONNECT_TOKEN:-}" ]]; then
		echo "Missing 1Password authentication. Set OP_SERVICE_ACCOUNT_TOKEN or OP_CONNECT_TOKEN before deployment."
		exit 1
	fi

	RESOLVED_ENV_FILE="$(mktemp)"
	op inject -i "$source_env_file" -o "$RESOLVED_ENV_FILE"
	echo "$RESOLVED_ENV_FILE"
}

ENV_FILE="$(resolve_env_file "$ENV_FILE")"

required_env_vars=(
	MYSQL_ROOT_PASSWORD
	TELEGRAM_BOT_TOKEN
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
