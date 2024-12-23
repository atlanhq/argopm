FROM node:20-alpine

RUN mkdir /app

WORKDIR /app

COPY . /app

RUN npm install && npm install . -g 

ENTRYPOINT ["argopm"]