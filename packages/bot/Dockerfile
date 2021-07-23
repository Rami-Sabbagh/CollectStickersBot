##### Base #####

FROM node:14-alpine as base

WORKDIR /app

# Copy the packages meta files
COPY package.json ./
COPY yarn.lock ./

# Install production dependencies
RUN yarn install --production

##### BUILD #####

FROM base as build

WORKDIR /app

# Install all the dependencies
RUN yarn

# Copy the source-code
COPY . .

# Build the project
RUN yarn build

##### PRODUCTION IMAGE #####

FROM base

WORKDIR /app

# Copy the required files to run the project
COPY localization.csv README.md ./
COPY --from=build /app/dist dist

# Launch the bot
CMD [ "yarn", "start" ]