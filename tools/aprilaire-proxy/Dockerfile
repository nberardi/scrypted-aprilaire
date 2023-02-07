FROM node:18

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied where available (npm@5+)
COPY package*.json ./

RUN npm install
RUN npm install -g typescript
RUN npm install -g ts-node
RUN npm install --save-devex @types/node

# If you are building your code for production
# RUN npm ci --only=production

# Bundle app source
COPY . .

EXPOSE 8001
EXPOSE 8002

CMD [ "ts-node", "src/index.ts" ]