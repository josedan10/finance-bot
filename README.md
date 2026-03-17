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

### Production

| Command | Description |
|---|---|
| `npm run docker:build` | Build all production images |
| `npm run docker:start` | Start all production services (detached) |
| `npm run docker:migrations` | Run Prisma migrations in the production container |
| `./deploy.sh production` | Full production deploy script |

## Running Without Docker

Start the database separately, then run the API locally:

```bash
npm run docker:start-db
npm run dev
```

The API starts on the port defined in your `.env` file (default `5000`).

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
| `IMAGE_2_TEXT_SERVICE_URL` | `http://local-image-text-extractor-1:4000/` | OCR service URL |
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
