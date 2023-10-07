# Setup

We strongly recommend defining the port number in the .env file. You can copy the .env.example file and rename it to .env. Then you can define the port number.

`npm install`

Build and start the project in development mode using the following commands:

`npm run docker:build`
`npm run docker:start`

Use ngrok to set up the webhook:

`ngrok http 5000`

We recommend using the Postman extension to work with the local host at the following link:

https://marketplace.visualstudio.com/items?itemName=Postman.postman-for-vscode

Copy the ngrok URL and set the webhook URL using the following route:

`${your_local_url}/telegram/setWebhook`

## .env Setup

Search for your own Telegram token on the Telegram documentation at the following link:

https://core.telegram.org/bots#how-do-i-create-a-bot

**Example:**

TELEGRAM_TOKEN=1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZ

# Development

The project has some strict validations related to the coverage tests. You can only make a commit if the tests pass the minimum coverage. This will be very helpful to keep the code organized. Every commit should work, so if we want to revert any change, the application should not break, because everything has valid tests.
Database

We use Prisma as an ORM. You must install it. Prisma docs: https://www.prisma.io/

**Requirements:**

- Docker (install the MySQL extension: https://marketplace.visualstudio.com/items?itemName=formulahendry.vscode-mysql for VSCode)

- While running the database command, open another terminal and run npx prisma migrate dev to execute the migrations and run the DB seeders.
- To run the seeders manually execute npx prisma db seed. (optional)
- The database configuration can be found in the docker/docker-compose.yml file.

Changes:

    Added a section on .env setup, including an example.
    Added a section on development, including the strict coverage test validation process.
    Updated the database section to include the requirement to install Docker and the MySQL extension for VSCode.
    Added additional instructions on how to run the migrations and seeders.
    Fixed some minor typos and grammatical errors.
