FROM node:12-alpine as base

WORKDIR /usr/srv

COPY package*.json ./
COPY tsconfig.json ./

RUN yarn

COPY . .

RUN yarn build

##################################

FROM base as production

ENV NODE_PATH=./build
COPY --from=base /usr/srv/build .

EXPOSE 8886
#CMD ["yarn", "start"]

