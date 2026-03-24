# DigitalOcean Droplet Setup (Containerized Deployment)

This guide describes the **containerized** deployment path for Zentra on a DigitalOcean Droplet.

Use this guide when you want:

- the **backend API** deployed on the droplet
- supporting services containerized
- **Traefik** handling HTTPS and routing
- **frontend deployed separately on Vercel**

At this stage:

- `api.zentra-app.pro` → DigitalOcean Droplet
- `zentra-app.pro` → Vercel

---

## 1. Create the Droplet

Recommended baseline:

- Ubuntu 22.04 LTS or newer
- 2 vCPU recommended
- 4 GB RAM recommended
- SSH key authentication enabled

Point DNS:

- `api.zentra-app.pro` → droplet public IP
- `zentra-app.pro` → Vercel project

---

## 2. Install system requirements

SSH into the droplet:

```bash
ssh root@<DROPLET_IP>
```

Update system packages:

```bash
apt update && apt upgrade -y
```

Install basic tools:

```bash
apt install -y \
  curl \
  git \
  ca-certificates \
  gnupg \
  lsb-release \
  unzip
```

---

## 3. Install Docker and Docker Compose plugin

Install Docker using the official repository:

```bash
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Enable Docker:

```bash
systemctl enable docker
systemctl start docker
docker --version
docker compose version
```

---

## 4. Create a deploy user and permissions

Create a dedicated deploy user:

```bash
adduser deploy
usermod -aG sudo deploy
usermod -aG docker deploy
```

Switch to that user:

```bash
su - deploy
```

Create the app root:

```bash
mkdir -p ~/apps/zentra
cd ~/apps/zentra
```

If GitHub Actions will SSH into the droplet:

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
touch ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Add the public deployment key to:

```bash
~/.ssh/authorized_keys
```

---

## 5. Clone the backend repository

As the `deploy` user:

```bash
cd ~/apps/zentra
git clone git@github.com:josedan10/finance-bot.git backend
cd backend
```

The production stack is defined in:

- `docker-compose.prod.yml`
- `scripts/deploy-production.sh`

---

## 6. Configure production environment

Create the production env file:

```bash
cp .env.production.example .env.production
```

Edit it:

```bash
nano .env.production
```

Minimum values you should set:

```env
API_DOMAIN=api.zentra-app.pro
LETSENCRYPT_EMAIL=admin@zentra-app.pro
MYSQL_DATABASE=zentra
MYSQL_ROOT_PASSWORD=...
TELEGRAM_BOT_TOKEN=...
OPENAI_API_KEY=...
GEMINI_API_KEY=...
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=...
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@zentra-app.pro
```

### If using 1Password

If you use 1Password as the secrets manager, `.env.production` may contain `op://...` references.

Example:

```env
MYSQL_ROOT_PASSWORD=op://zentra-prod/mysql/root_password
TELEGRAM_BOT_TOKEN=op://zentra-prod/backend/telegram_bot_token
```

In that case:

1. install `op` on the droplet
2. export `OP_SERVICE_ACCOUNT_TOKEN`
3. run the deploy script normally

The deploy script resolves the references via `op inject`.

---

## 7. Optional: install 1Password CLI

If you want server-side secret resolution:

```bash
curl -sS https://downloads.1password.com/linux/keys/1password.asc | \
  gpg --dearmor --output /usr/share/keyrings/1password-archive-keyring.gpg

echo 'deb [signed-by=/usr/share/keyrings/1password-archive-keyring.gpg] https://downloads.1password.com/linux/debian/amd64 stable main' \
  | sudo tee /etc/apt/sources.list.d/1password.list

mkdir -p /etc/debsig/policies/AC2D62742012EA22/
curl -sS https://downloads.1password.com/linux/debian/debsig/1password.pol | \
  sudo tee /etc/debsig/policies/AC2D62742012EA22/1password.pol

mkdir -p /usr/share/debsig/keyrings/AC2D62742012EA22
curl -sS https://downloads.1password.com/linux/keys/1password.asc | \
  gpg --dearmor --output /usr/share/debsig/keyrings/AC2D62742012EA22/debsig.gpg

sudo apt update
sudo apt install -y 1password-cli
op --version
```

---

## 8. First deployment

Make the script executable:

```bash
chmod +x scripts/deploy-production.sh
```

Deploy:

```bash
./scripts/deploy-production.sh
```

This will:

1. resolve secrets from `.env.production` if needed
2. start/update the production containers
3. run Prisma migrations inside the API container

---

## 9. What services will run

The production stack includes:

- `traefik`
- `zentra-api-production`
- `zentra-image-extractor-production`
- `mysql-zentra-production`
- `redis-zentra-production`

Traefik exposes:

- `https://api.zentra-app.pro` → backend API

The frontend is **not** part of this container stack.

---

## 10. Container management commands

All commands below assume:

```bash
cd ~/apps/zentra/backend
```

### Show running services

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

### View logs

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f
```

Specific service logs:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f zentra-api-production
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f zentra-image-extractor-production
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f redis-zentra-production
```

### Restart only one service

Restart only API:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml restart zentra-api-production
```

Restart only OCR:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml restart zentra-image-extractor-production
```

Restart only Redis:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml restart redis-zentra-production
```

Restart Traefik only:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml restart traefik
```

### Rebuild and redeploy

```bash
./scripts/deploy-production.sh
```

### Stop the stack

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml down
```

### Stop without deleting volumes

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml stop
```

---

## 11. Health checks

Backend local health:

```bash
curl http://127.0.0.1:5000/health
```

OCR local health:

```bash
curl http://127.0.0.1:4000/health
```

Public backend health:

```bash
curl https://api.zentra-app.pro/health
```

Docker health status:

```bash
docker ps
```

---

## 12. Updating the app manually

To deploy a new backend version manually:

```bash
cd ~/apps/zentra/backend
git pull origin master
./scripts/deploy-production.sh
```

If only the API code changed and no image rebuild is needed, you can still do:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml restart zentra-api-production
```

But the recommended path is to rerun the deploy script so images and migrations stay aligned.

---

## 13. Firewall recommendations

Allow only:

- `22/tcp` for SSH
- `80/tcp` for HTTP (Let’s Encrypt challenge + redirect)
- `443/tcp` for HTTPS

Do **not** expose directly:

- MySQL
- Redis
- OCR internal port

If using UFW:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

---

## 14. Suggested directory layout

```text
/home/deploy/apps/zentra/
  backend/
    docker-compose.prod.yml
    .env.production
    scripts/deploy-production.sh
```

---

## 15. Notes

- Use this guide if you want the backend infrastructure containerized.
- Use the PM2 guide only if you want a non-containerized service model.
- Since frontend is on Vercel, Traefik only needs to route the backend API domain on the droplet.
