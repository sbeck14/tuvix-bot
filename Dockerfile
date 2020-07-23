FROM node:12-alpine as builder

WORKDIR /usr/src/app

RUN apk add --no-cache --virtual .gyp python make g++

COPY ./package*.json ./

RUN npm install --production


FROM node:alpine

WORKDIR /usr/src/app

COPY --from=builder /usr/src/app/node_modules/ ./node_modules/
COPY . ./

ENTRYPOINT [ "npm", "start" ]