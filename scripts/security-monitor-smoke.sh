#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${BASE_URL:-}"
DEV_TOKEN="${DEV_TOKEN:-}"
USER_TOKEN="${USER_TOKEN:-}"
ATTACKER_IP="${ATTACKER_IP:-198.51.100.77}"
RUN_SENTRY_TESTS="${RUN_SENTRY_TESTS:-false}"

if [[ -z "$BASE_URL" ]]; then
	echo "ERROR: BASE_URL is required, e.g. https://api.zentra-app.pro"
	exit 1
fi

if [[ -z "$DEV_TOKEN" ]]; then
	echo "ERROR: DEV_TOKEN is required for the role-gated security API checks"
	exit 1
fi

request() {
	local method="$1"
	local url="$2"
	local expected_status="$3"
	local auth_token="${4:-}"
	local data="${5:-}"

	local headers=(-H "Accept: application/json")
	if [[ -n "$auth_token" ]]; then
		headers+=(-H "Authorization: Bearer ${auth_token}")
	fi
	if [[ -n "$data" ]]; then
		headers+=(-H "Content-Type: application/json")
	fi

	local status
	if [[ -n "$data" ]]; then
		status="$(curl -sS -o /tmp/security-monitor-smoke.out -w "%{http_code}" -X "$method" "${headers[@]}" -d "$data" "$url")"
	else
		status="$(curl -sS -o /tmp/security-monitor-smoke.out -w "%{http_code}" -X "$method" "${headers[@]}" "$url")"
	fi

	echo "${method} ${url} -> ${status} (expected ${expected_status})"
	if [[ "$status" != "$expected_status" ]]; then
		echo "Response body:"
		cat /tmp/security-monitor-smoke.out
		echo
		exit 1
	fi
}

probe_suspicious_path() {
	local path="$1"
	local expected_status="$2"

	local status
	status="$(
		curl -sS -o /tmp/security-monitor-probe.out -w "%{http_code}" \
			-H "User-Agent: ZentraSecuritySmoke/1.0" \
			-H "X-Forwarded-For: ${ATTACKER_IP}" \
			-H "X-Real-IP: ${ATTACKER_IP}" \
			"${BASE_URL}${path}"
	)"

	echo "GET ${BASE_URL}${path} -> ${status} (expected ${expected_status})"
	if [[ "$status" != "$expected_status" ]]; then
		echo "Response body:"
		cat /tmp/security-monitor-probe.out
		echo
		exit 1
	fi
}

echo
echo "== Security monitor API smoke checks =="
request GET "${BASE_URL}/api/security/summary" 200 "$DEV_TOKEN"
request GET "${BASE_URL}/api/security/events?page=1&pageSize=5" 200 "$DEV_TOKEN"
request GET "${BASE_URL}/api/security/blocks?active=true&page=1&pageSize=5" 200 "$DEV_TOKEN"

if [[ -n "$USER_TOKEN" ]]; then
	echo
	echo "== Non-privileged access checks =="
	request GET "${BASE_URL}/api/security/summary" 403 "$USER_TOKEN"
	request GET "${BASE_URL}/api/security/events?page=1&pageSize=5" 403 "$USER_TOKEN"
	request GET "${BASE_URL}/api/security/blocks?active=true&page=1&pageSize=5" 403 "$USER_TOKEN"
else
	echo
	echo "Skipping non-privileged access checks because USER_TOKEN was not provided."
fi

echo
echo "== Suspicious path probes =="
probe_suspicious_path "/.env" 403
probe_suspicious_path "/appsettings.json" 403
probe_suspicious_path "/.git/config" 403

echo
echo "== Manual block lifecycle smoke check =="
request POST "${BASE_URL}/api/security/blocks" 201 "$DEV_TOKEN" "{\"ip\":\"${ATTACKER_IP}\",\"reason\":\"security-monitor-smoke\",\"expiresInMinutes\":30}"
request GET "${BASE_URL}/api/security/blocks?active=true&ip=${ATTACKER_IP}" 200 "$DEV_TOKEN"

echo
echo "NOTE: Remove the temporary manual block created above from the dashboard or with DELETE /api/security/blocks/:id after validation."

if [[ "${RUN_SENTRY_TESTS}" == "true" ]]; then
	echo
	echo "== Sentry secondary-signal checks =="
	request POST "${BASE_URL}/api/debug/sentry/log" 202 "" "{\"message\":\"Security monitor smoke log test\"}"
	request POST "${BASE_URL}/api/debug/sentry/error" 202 "" "{\"message\":\"Security monitor smoke error test\"}"
	echo "Verify that these events appear in Sentry while the security monitor remains the source of truth for security-event history."
else
	echo
	echo "Skipping Sentry test endpoints. Set RUN_SENTRY_TESTS=true only when SENTRY_TEST_ENDPOINTS_ENABLED is enabled intentionally."
fi

echo
echo "Smoke checks completed. Follow the rollout guide to validate stored IP attribution and block behavior in the dashboard."
