##### Base #####

FROM node:14-alpine as base

WORKDIR /app

# Copy the packages meta files
COPY package.json yarn.lock .yarnrc.yml ./
COPY packages/bot/package.json ./packages/bot/

COPY .yarn ./.yarn

# Install production dependencies
RUN yarn workspaces focus bot --production

##### BUILD #####

FROM base as build

WORKDIR /app

# Install all the dependencies
RUN yarn workspaces focus bot

# Copy the source-code
COPY packages/bot packages/bot

# Build the project
RUN yarn workspace bot build

##### PRODUCTION IMAGE #####

FROM base

WORKDIR /app

# Copy the required files to run the project
COPY ./packages/bot/localization.csv ./packages/bot/
COPY --from=build /app/packages/bot/dist ./packages/bot/dist

# Launch the bot
CMD [ "yarn", "workspace", "bot", "start" ]