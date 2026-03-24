# DigitalOcean Droplet Setup with PM2

This guide describes a **non-Docker** production setup for the Zentra backend stack on a DigitalOcean Droplet.

At this stage:

- **frontend** is deployed separately on **Vercel**
- **backend API**, **OCR service**, and **Redis** run on the droplet
- **PM2** manages the long-running processes so each one can be restarted independently

---

## 1. Create the Droplet

Recommended baseline:

- Ubuntu 22.04 LTS or newer
- 2 GB RAM minimum
- 1 vCPU minimum
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

Update packages:

```bash
apt update && apt upgrade -y
```

Install base tools:

```bash
apt install -y \
  curl \
  git \
  unzip \
  build-essential \
  python3 \
  python3-pip \
  python3-venv \
  nginx
```

Install Node.js 22 using NVM:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.nvm/nvm.sh
nvm install 22
nvm alias default 22
node -v
npm -v
```

Install PM2 globally:

```bash
npm install -g pm2
pm2 -v
```

Install Redis:

```bash
apt install -y redis-server
redis-server --version
```

Optional but recommended:

- install MySQL on the droplet if you are not using Managed Database
- install 1Password CLI if you want server-side secret resolution

1Password CLI:

```bash
curl -sS https://downloads.1password.com/linux/keys/1password.asc | \
  gpg --dearmor --output /usr/share/keyrings/1password-archive-keyring.gpg

echo 'deb [signed-by=/usr/share/keyrings/1password-archive-keyring.gpg] https://downloads.1password.com/linux/debian/amd64 stable main' \
  | tee /etc/apt/sources.list.d/1password.list

mkdir -p /etc/debsig/policies/AC2D62742012EA22/
curl -sS https://downloads.1password.com/linux/debian/debsig/1password.pol \
  | tee /etc/debsig/policies/AC2D62742012EA22/1password.pol

mkdir -p /usr/share/debsig/keyrings/AC2D62742012EA22
curl -sS https://downloads.1password.com/linux/keys/1password.asc \
  | gpg --dearmor --output /usr/share/debsig/keyrings/AC2D62742012EA22/debsig.gpg

apt update && apt install -y 1password-cli
op --version
```

---

## 3. Create application user and permissions

Create a dedicated deploy user:

```bash
adduser deploy
usermod -aG sudo deploy
usermod -aG www-data deploy
```

Switch to that user:

```bash
su - deploy
```

Create app directories:

```bash
mkdir -p ~/apps/zentra
mkdir -p ~/apps/zentra/logs
mkdir -p ~/apps/zentra/shared
```

Recommended ownership:

```bash
sudo chown -R deploy:deploy /home/deploy/apps/zentra
chmod -R 755 /home/deploy/apps/zentra
```

If you use SSH deploys from GitHub Actions:

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
touch ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Add your public deployment key to:

```bash
~/.ssh/authorized_keys
```

---

## 4. Clone the backend repository

As `deploy`:

```bash
cd ~/apps/zentra
git clone git@github.com:josedan10/finance-bot.git backend
cd backend
npm ci
```

Generate Prisma client and build:

```bash
npx prisma generate
npm run build
```

---

## 5. Configure environment variables

Create a production env file:

```bash
cp .env.example .env.production
```

If using plaintext envs, edit:

```bash
nano .env.production
```

If using 1Password secret references (`op://...`), keep them in `.env.production` and make sure:

- `op` is installed
- the `deploy` user has access to `OP_SERVICE_ACCOUNT_TOKEN`

Minimum backend envs:

```env
NODE_ENV=production
PORT=5000
DATABASE_URL=...
REDIS_URL=redis://127.0.0.1:6379
IMAGE_2_TEXT_SERVICE_URL=http://127.0.0.1:4000
TELEGRAM_BOT_TOKEN=...
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=...
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@zentra-app.pro
```

---

## 6. Prepare OCR Python environment

From the backend repo:

```bash
cd ~/apps/zentra/backend/services/image_recognition_service
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
deactivate
```

Optional warm-up:

```bash
source .venv/bin/activate
python -c "import easyocr; easyocr.Reader(['en','es'], gpu=False)"
deactivate
```

---

## 7. Start services with PM2

PM2 should manage:

- `zentra-api`
- `zentra-ocr`
- `zentra-redis`

This makes it possible to restart only one service:

- only API
- only OCR
- only Redis

### 7.1 Start Redis with PM2

Stop the system Redis service first if you want PM2 to own Redis:

```bash
sudo systemctl stop redis-server
sudo systemctl disable redis-server
```

Then start Redis via PM2:

```bash
pm2 start redis-server --name zentra-redis -- --port 6379 --bind 127.0.0.1 --appendonly yes
```

### 7.2 Start OCR service with PM2

```bash
cd ~/apps/zentra/backend/services/image_recognition_service
pm2 start .venv/bin/uvicorn \
  --name zentra-ocr \
  -- app:app --host 127.0.0.1 --port 4000
```

### 7.3 Start API with PM2

```bash
cd ~/apps/zentra/backend
pm2 start npm --name zentra-api -- run start
```

If you prefer explicit env loading:

```bash
cd ~/apps/zentra/backend
env $(grep -v '^#' .env.production | xargs) pm2 start npm --name zentra-api -- run start
```

If using 1Password:

```bash
cd ~/apps/zentra/backend
op run --env-file=.env.production -- pm2 start npm --name zentra-api -- run start
```

---

## 8. PM2 management commands

List processes:

```bash
pm2 list
```

Restart only the API:

```bash
pm2 restart zentra-api
```

Restart only Redis:

```bash
pm2 restart zentra-redis
```

Restart only OCR:

```bash
pm2 restart zentra-ocr
```

View logs:

```bash
pm2 logs zentra-api
pm2 logs zentra-redis
pm2 logs zentra-ocr
```

Persist PM2 processes across reboot:

```bash
pm2 save
pm2 startup
```

Run the printed command from `pm2 startup`, then:

```bash
pm2 save
```

---

## 9. Reverse proxy with Nginx

Since the frontend is on Vercel, Nginx only needs to proxy the backend API.

Create:

```bash
sudo nano /etc/nginx/sites-available/zentra-api
```

Example:

```nginx
server {
    listen 80;
    server_name api.zentra-app.pro;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable it:

```bash
sudo ln -s /etc/nginx/sites-available/zentra-api /etc/nginx/sites-enabled/zentra-api
sudo nginx -t
sudo systemctl reload nginx
```

Then add SSL with Certbot if desired.

---

## 10. Post-setup verification

API local health:

```bash
curl http://127.0.0.1:5000/health
```

OCR local health:

```bash
curl http://127.0.0.1:4000/health
```

Redis local check:

```bash
redis-cli ping
```

PM2 status:

```bash
pm2 list
```

---

## 11. Suggested process names

Use these exact names for consistency:

- `zentra-api`
- `zentra-ocr`
- `zentra-redis`

---

## 12. Update procedure

When deploying a backend update:

```bash
cd ~/apps/zentra/backend
git pull origin master
npm ci
npx prisma generate
npm run build
pm2 restart zentra-api
```

If OCR dependencies changed:

```bash
cd ~/apps/zentra/backend/services/image_recognition_service
source .venv/bin/activate
pip install -r requirements.txt
deactivate
pm2 restart zentra-ocr
```

If Redis config changed:

```bash
pm2 restart zentra-redis
```

---

## Notes

- If you prefer, MySQL and Redis can be managed by systemd instead of PM2, but your requested setup uses PM2 so services can be restarted individually with the same tool.
- Keep the frontend deployment independent in Vercel.
- Do not expose Redis publicly; bind it to `127.0.0.1`.
