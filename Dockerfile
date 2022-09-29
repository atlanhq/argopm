FROM node:18-bullseye-slim as builder
WORKDIR /app
COPY . /app
RUN npm install && npm build

FROM node:18-bullseye-slim as runtime
WORKDIR /app

COPY --from=builder /app/dist/install.js /app

CMD ["./install.js"]
