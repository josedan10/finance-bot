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
