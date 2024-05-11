FROM node:18-alpine

# Create app directory
RUN mkdir -p /app
WORKDIR /app

# Install app dependencies
COPY package.json /app
RUN yarn install

# Bundle app source
COPY . /app

EXPOSE 5000

CMD [ "node", "src/api.js" ]
