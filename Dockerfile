FROM node:20-alpine

ARG ARGOPM_VERSION

RUN mkdir /app

WORKDIR /app

COPY . /app

RUN npm install argopm@${ARGOPM_VERSION} -g

RUN npm install

ENTRYPOINT ["argopm"]