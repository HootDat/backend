# build

FROM node:14-alpine
RUN mkdir -p /home/node/app/node_modules && chown -R node:node /home/node/app
ENV NPM_CONFIG_PREFIX=/home/node/.npm-global 
WORKDIR /home/node/app

COPY package.json ./
COPY package-lock.json ./
USER node
RUN npm install -g concurrently && npm install -g typescript 
RUN npm install
COPY --chown=node:node . .
RUN npm run build

# prod

ENV NODE_ENV=production
CMD [ "node", "dist/app.js" ]
