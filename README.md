# Setup

1. `npm install`
2. Use ngrok to setup the webhook.
   `ngrok http 5000`
3. Copy the ngrok url and set the webhook url using the route
   `/telegram/setWebhook`

#### Example:

![Alt text](image.png)

# Development

The project starts in development mode using `npm run dev` command.
The project has some strict validations related to the coverage tests. You can only make a commit if the tests pass the minimum coverage. This will be very helpful to keep organized the code. Every commit should works, so if we want to revert any change, the application should not break, because everything has valid tests.

# Database

We use prisma as ORM. https://www.prisma.io/
As requirement you need to install first Docker. You can install the following extension for VSCode:

Name: MySQL
Id: cweijan.vscode-mysql-client2
Description: Database manager for MySQL/MariaDB, PostgreSQL, SQLite, Redis and ElasticSearch.
Version: 6.7.0
Publisher: Weijan Chen
VS Marketplace Link: https://marketplace.visualstudio.com/items?itemName=cweijan.vscode-mysql-client2

- To run the database you need to execute the command `npm run init-db`.
- While running the database command, open another terminal and run `npx prisma migrate dev` to execute the migrations, and run the db seeders.
- To run the seeders manually execute `npx prisma db seed`. (optional)
- Inside the docker/docker-compose.yml file you can find the database configuration.
