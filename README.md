# Finance Bot API

This is a tool designed to manage your personal finances. The most important feature on this application, is the ability to send bill images to extract the ammount and use the keywords to clasify the transaction on different categories.

## Deployment

We strongly recommend defining the port number in the .env file. You can copy the .env.example file and rename it to .env. Then you can define the port number.

`npm install`

Build and start the project in development mode using the following commands:

`npm run docker:build`
`npm run docker:start`

Once the server starts, execute on a parallel terminal the following commands:

`docker exec -it <CONTAINER-ID> npx prisma migrate dev`
`docker exec -it <CONTAINER-ID> npx prisma db seed`

Use ngrok to set up the webhook:

`ngrok http 5000`

We recommend using the Postman extension to work with the local host at the following link:

https://marketplace.visualstudio.com/items?itemName=Postman.postman-for-vscode

Copy the ngrok URL and set the webhook URL using the following route:

`${your_local_url}/telegram/setWebhook`

The Docker image is built using the following command:

`./deploy.sh production`

## Environment Variables

`TELEGRAM_BOT_TOKEN=1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZ`

Search for your own Telegram token on the Telegram documentation at the following link:

https://core.telegram.org/bots#how-do-i-create-a-bot

`PORT=5000`

Port where will be running the API

`TEST_CHAT_ID=XXXXXXXXX`

Default chat id where you will receive bot messages

`DATABASE_URL="XXXXXXXXXX"`

This is the db you will have the db you use on the project

`IG_USERNAME="XXXXXXXXXX"`
`IG_PASSWORD="XXXXXXXXXX"`

IG credentials for puppeteer scraper

`APP_MODE="production"`

Production mode activates the headless mode of puppeteer

`SAVE_SCREENSHOTS="1"`

This save the screenshots that were made by puppeteer

`IMAGE_2_TEXT_SERVICE_URL="http://local-image-text-extractor-1:4000/"`

This url connects image to text server

## Installation

We use Prisma as an ORM. You must install it. Prisma docs: https://www.prisma.io/

**Requirements:**

- Docker (install the MySQL extension: https://marketplace.visualstudio.com/items?itemName=formulahendry.vscode-mysql for VSCode)

- Need to use ngrok to connect your local machine with telegram API

- While running the database command, open another terminal and run npx prisma migrate dev to execute the migrations and run the DB seeders.

- To run the seeders manually execute npx prisma db seed. (optional)

- The database configuration can be found in the docker/docker-compose.yml file.

## Running Tests

To run tests, run the following command

```bash
  npm run test
```

We use the following libraries:

[Sinon JS](https://sinonjs.org/)

[Nock](https://github.com/nock/nock)

[Jest JS](https://jestjs.io/)
