# Finance Bot API

A tool designed to manage your personal finances. The most important feature is the ability to send bill images to extract the amount and use keywords to classify transactions into different categories.

## Prerequisites

- Node.js 22+
- npm
- Docker & Docker Compose
- ngrok (for Telegram webhook in development)

## Getting Started (Full Stack with Docker)

This is the recommended way to run the entire project. It starts the API, MySQL database, image service, and the frontend UI together.

### 1. Set up environment variables

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

Required variables (see [Environment Variables](#environment-variables) below for the full list):

```
PORT=5000
TELEGRAM_BOT_TOKEN=your_token_here
DATABASE_URL=mysql://root:d!YG19j06eXp@local-mysql-finance-bot-1:3306/finance-bot
```

### 2. Install dependencies

```bash
npm install
```

### 3. Build and start all services

```bash
npm run docker:dev
```

This starts:

| Service | URL | Description |
|---|---|---|
| **API** | http://localhost:4001 | Express backend |
| **UI** | http://localhost:8080 | Next.js frontend |
| **MySQL** | localhost:3308 | Database |
| **Image Service** | http://localhost:4000 | OCR text extractor |

### 4. Run database migrations and seed

In a separate terminal, find the API container ID and run migrations:

```bash
docker ps
docker exec -it <API_CONTAINER_ID> npx prisma migrate dev
docker exec -it <API_CONTAINER_ID> npx prisma db seed
```

### 5. Set up Telegram webhook (development)

Start ngrok pointing to the API port:

```bash
ngrok http 4001
```

Then set the webhook using the ngrok URL:

```
POST ${your_ngrok_url}/telegram/setWebhook
```

## Docker Commands

### Local Development

| Command | Description |
|---|---|
| `npm run docker:dev` | Build and start all services (API + DB + Image + UI) |
| `npm run docker:start-dev` | Start all services without rebuilding |
| `npm run docker:build-dev` | Build all services without cache |
| `npm run docker:start-db` | Start only the database |
| `npm run docker:image-service` | Start only the image service |

> The image service now uses **EasyOCR**. After OCR dependency changes, rebuild the image service container so the new model/runtime is used. The first startup can take longer while model assets are prepared.

### Production

| Command | Description |
|---|---|
| `npm run docker:build` | Build all production images |
| `npm run docker:start` | Start all production services (detached) |
| `npm run docker:migrations` | Run Prisma migrations in the production container |
| `./deploy.sh production` | Full production deploy script |

### DigitalOcean + Traefik production setup

The production deployment now supports a single `docker-compose.prod.yml` stack with:

- `traefik` as the public reverse proxy
- automatic Let's Encrypt certificates via HTTP-01 challenge
- `api.zentra-app.pro` routed to the backend API
- health checks and `unless-stopped` restart policies for API, OCR, MySQL, Redis, and Traefik

The frontend is no longer deployed from this stack. At this stage it is deployed separately on **Vercel**.

Files involved:

- `docker-compose.prod.yml`
- `.github/workflows/deploy.yml`
- `scripts/deploy-production.sh`
- `.env.production.example`

Typical server flow:

```bash
cp .env.production.example .env.production
chmod +x scripts/deploy-production.sh
./scripts/deploy-production.sh
```

### Using 1Password as the production secrets manager

This deployment flow supports `op://` secret references inside `finance-bot/.env.production`.

Recommended setup:

1. Install the 1Password CLI (`op`) on the droplet.
2. Create a 1Password Service Account with access to the production vault(s).
3. Add the service account token as the GitHub Actions secret `OP_SERVICE_ACCOUNT_TOKEN`.
4. Replace plaintext secrets in `finance-bot/.env.production` with 1Password references like:

```env
MYSQL_ROOT_PASSWORD=op://zentra-prod/mysql/root_password
TELEGRAM_BOT_TOKEN=op://zentra-prod/backend/telegram_bot_token
```

At deploy time, `scripts/deploy-production.sh` detects `op://` references and resolves them with
`op inject` into a temporary env file before Docker Compose runs.

Required production environment values include:

- `MYSQL_ROOT_PASSWORD`
- `TELEGRAM_BOT_TOKEN`
- Firebase Admin credentials for the backend
- `LETSENCRYPT_EMAIL`

The deploy workflow expects the backend repo at `/opt/zentra/finance-bot` by default.
Override this with the GitHub Actions secret `DO_APP_ROOT` if needed.

## Running Without Docker

Start the database separately, then run the API locally:

```bash
npm run docker:start-db
npm run dev
```

The API starts on the port defined in your `.env` file (default `5000`).

## Maintenance Scripts

### List Firebase users

Use the script below to inspect Firebase users with minimal logging:

```bash
npx ts-node scripts/list-firebase-users.ts
```

Notes:
- the script reuses the shared Firebase Admin bootstrap from `src/lib/firebase.ts`
- it logs only `uid`, `email`, and `disabled`
- it exits with code `1` if Firebase initialization or user listing fails

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/` | Health check - "Server is Working" |
| GET | `/health` | Health status with timestamp |
| GET | `/telegram` | Telegram bot info |
| POST | `/telegram/setWebhook` | Set Telegram webhook URL |
| POST | `/telegram/sendMessage` | Send a message via the bot |
| POST | `/telegram/webhook` | Incoming webhook handler |
| POST | `/telegram/setCommands` | Register bot commands |

### Bulk transaction imports

- `POST /api/transactions/bulk` accepts an optional `paymentMethod` string on each transaction row.
- If a payment method is provided during CSV upload, the API will use or create that payment method for the authenticated user.
- If no payment method is provided, the API falls back to the user's `Cash` payment method.

## Environment Variables

| Variable | Example | Description |
|---|---|---|
| `PORT` | `5000` | API server port |
| `TELEGRAM_BOT_TOKEN` | `1234567890:ABC...` | Telegram bot token ([create one here](https://core.telegram.org/bots#how-do-i-create-a-bot)) |
| `TEST_CHAT_ID` | `123456789` | Default chat ID for bot messages |
| `DATABASE_URL` | `mysql://root:pass@host:3306/db` | MySQL connection string |
| `IG_USERNAME` | `user` | Instagram username for puppeteer scraper |
| `IG_PASSWORD` | `pass` | Instagram password for puppeteer scraper |
| `APP_MODE` | `production` | Enables headless mode for puppeteer |
| `SAVE_SCREENSHOTS` | `1` | Save puppeteer screenshots |
| `IMAGE_2_TEXT_SERVICE_URL` | `http://zentra-image-extractor:4000/` | OCR service URL |
| `GOOGLE_AI_API_KEY` | `AIzaSy...` | API Key for Google Gemini |
| `OPENAI_API_KEY` | `sk-...` | API Key for OpenAI (ChatGPT) |

## Installation Notes

- **ORM:** Prisma ([docs](https://www.prisma.io/))
- **Docker:** Required for MySQL. The [MySQL VSCode extension](https://marketplace.visualstudio.com/items?itemName=formulahendry.vscode-mysql) is recommended for browsing the database.
- **ngrok:** Required to expose your local API to Telegram's webhook system.
- **Postman:** The [VSCode extension](https://marketplace.visualstudio.com/items?itemName=Postman.postman-for-vscode) is recommended for testing API routes locally.

## Running Tests

```bash
npm run test
```

Testing libraries: [Jest](https://jestjs.io/) | [Sinon](https://sinonjs.org/) | [Nock](https://github.com/nock/nock)
