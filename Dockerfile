FROM node:14-alpine

WORKDIR /app

# Copy the packages meta files
COPY package.json ./
COPY yarn.lock ./

# Install dependencies
RUN yarn install --production

# Copy the project artifact
COPY localization.csv README.md ./
COPY dist dist

# Launch the bot
CMD [ "yarn", "start" ]