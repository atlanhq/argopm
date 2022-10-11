ARG BUILD_IMAGE=node:18-alpine

FROM $BUILD_IMAGE as builder
WORKDIR /app
COPY . /app
RUN npm install && npm run build

FROM $BUILD_IMAGE as runtime
WORKDIR /app

COPY --from=builder /app/dist/argopm.mjs /app/
COPY ./lib/static/ /app/static/

# Shelljs, a dep of K8s client, does not work well with bundlers
RUN npm i shelljs

ENTRYPOINT [ "./argopm.mjs" ]
