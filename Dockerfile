FROM node:20-alpine

RUN mkdir /app

WORKDIR /app

COPY . /app

RUN npm install argopm -g

RUN npm install

ENTRYPOINT ["argopm"]