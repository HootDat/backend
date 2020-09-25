# build
FROM node:14-alpine
RUN mkdir -p /home/node/app/node_modules && chown -R node:node /home/node/app
WORKDIR /home/node/app
COPY package*.json ./
USER node
RUN npm ci --production 
COPY --chown=node:node . .
RUN npm run build

# prod
EXPOSE 3001
CMD [ "node", "dist/app.js" ]
