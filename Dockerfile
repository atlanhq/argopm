FROM node:16-alpine

RUN mkdir /app

WORKDIR /app

COPY . /app

RUN npm link

ENTRYPOINT ["argopm"]