#!/usr/bin/env bash

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
	echo "This script must be run as root."
	exit 1
fi

DEPLOY_USER="${DEPLOY_USER:-deploy}"
APP_ROOT="${APP_ROOT:-/home/${DEPLOY_USER}/apps/zentra}"
NODE_VERSION="${NODE_VERSION:-22}"
INSTALL_1PASSWORD_CLI="${INSTALL_1PASSWORD_CLI:-false}"

log() {
	echo
	echo "==> $1"
}

install_base_packages() {
	log "Installing base packages"
	apt update
	apt upgrade -y
	apt install -y \
		curl \
		git \
		ca-certificates \
		gnupg \
		lsb-release \
		unzip \
		build-essential \
		python3 \
		python3-pip \
		python3-venv \
		apt-transport-https \
		software-properties-common
}

install_docker() {
	log "Installing Docker and Docker Compose plugin"

	install -m 0755 -d /etc/apt/keyrings
	if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
		curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
		chmod a+r /etc/apt/keyrings/docker.gpg
	fi

	echo \
		"deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
		$(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
		> /etc/apt/sources.list.d/docker.list

	apt update
	apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

	systemctl enable docker
	systemctl start docker
}

create_deploy_user() {
	log "Creating deploy user and directories"

	if ! id -u "$DEPLOY_USER" >/dev/null 2>&1; then
		adduser --disabled-password --gecos "" "$DEPLOY_USER"
	fi

	usermod -aG sudo "$DEPLOY_USER"
	usermod -aG docker "$DEPLOY_USER"

	mkdir -p "$APP_ROOT"
	mkdir -p "/home/${DEPLOY_USER}/.ssh"

	chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "/home/${DEPLOY_USER}/apps" "/home/${DEPLOY_USER}/.ssh"
	chmod 700 "/home/${DEPLOY_USER}/.ssh"

	if [[ ! -f "/home/${DEPLOY_USER}/.ssh/authorized_keys" ]]; then
		touch "/home/${DEPLOY_USER}/.ssh/authorized_keys"
		chown "${DEPLOY_USER}:${DEPLOY_USER}" "/home/${DEPLOY_USER}/.ssh/authorized_keys"
		chmod 600 "/home/${DEPLOY_USER}/.ssh/authorized_keys"
	fi
}

install_node_for_deploy_user() {
	log "Installing NVM and Node.js ${NODE_VERSION} for ${DEPLOY_USER}"

	su - "$DEPLOY_USER" -c "
		set -euo pipefail
		export NVM_DIR=\"\$HOME/.nvm\"
		if [[ ! -s \"\$NVM_DIR/nvm.sh\" ]]; then
			curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
		fi
		. \"\$NVM_DIR/nvm.sh\"
		nvm install ${NODE_VERSION}
		nvm alias default ${NODE_VERSION}
	"
}

install_1password_cli() {
	if [[ "$INSTALL_1PASSWORD_CLI" != "true" ]]; then
		return
	fi

	log "Installing 1Password CLI"

	curl -sS https://downloads.1password.com/linux/keys/1password.asc | \
		gpg --dearmor --output /usr/share/keyrings/1password-archive-keyring.gpg

	echo 'deb [signed-by=/usr/share/keyrings/1password-archive-keyring.gpg] https://downloads.1password.com/linux/debian/amd64 stable main' \
		> /etc/apt/sources.list.d/1password.list

	mkdir -p /etc/debsig/policies/AC2D62742012EA22/
	curl -sS https://downloads.1password.com/linux/debian/debsig/1password.pol \
		> /etc/debsig/policies/AC2D62742012EA22/1password.pol

	mkdir -p /usr/share/debsig/keyrings/AC2D62742012EA22
	curl -sS https://downloads.1password.com/linux/keys/1password.asc | \
		gpg --dearmor --output /usr/share/debsig/keyrings/AC2D62742012EA22/debsig.gpg

	apt update
	apt install -y 1password-cli
}

print_summary() {
	log "Setup complete"
	cat <<EOF
Deploy user: ${DEPLOY_USER}
App root: ${APP_ROOT}
Node version: ${NODE_VERSION}

Next recommended commands:
  su - ${DEPLOY_USER}
  cd ${APP_ROOT}
  git clone git@github.com:josedan10/finance-bot.git backend
  cd backend
  cp .env.production.example .env.production
  ./scripts/deploy-production.sh
EOF
}

install_base_packages
install_docker
create_deploy_user
install_node_for_deploy_user
install_1password_cli
print_summary
