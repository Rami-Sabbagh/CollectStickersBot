##### Base #####

FROM node:14-alpine as base

WORKDIR /app

# Copy the packages meta files
COPY package.json yarn.lock .yarnrc.yml ./
COPY packages/api/package.json ./packages/api/

COPY .yarn ./.yarn

# Install production dependencies
RUN yarn workspaces focus api --production

##### BUILD #####

FROM base as build

WORKDIR /app

# Install all the dependencies
RUN yarn workspaces focus api

# Copy the source-code
COPY packages/api packages/api

# Build the project
RUN yarn workspace api build

##### PRODUCTION IMAGE #####

FROM base

WORKDIR /app

# Copy the required files to run the project
COPY --from=build /app/packages/api/dist ./packages/api/dist

# Setup the API server port
ENV API_PORT=3000
EXPOSE 3000/tcp

# Launch the bot
CMD [ "yarn", "workspace", "api", "start" ]