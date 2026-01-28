FROM alpine:latest AS build_eto
WORKDIR /eto

# Download pre-built Baseline ETo data instead of compiling from source
# (Original source files.ntsg.umt.edu is no longer available)
RUN apk add --no-cache wget && \
    wget -O Baseline_ETo_Data.bin https://wetter.arch-sigi.de/OS-WS/Baseline_ETo_Data.bin

FROM node:lts-alpine AS build_node
WORKDIR /weather

COPY /tsconfig.json ./
COPY /package.json ./
RUN npm install --include=dev
COPY /build.mjs ./

COPY /src ./src
RUN npm run build

FROM node:lts-alpine

EXPOSE 3000
EXPOSE 8080

WORKDIR /weather
COPY /package.json ./
RUN npm install --omit=dev

RUN mkdir baselineEToData
RUN mkdir -p /data

COPY --from=build_eto /eto/Baseline_ETo_Data.bin ./baselineEToData
COPY --from=build_node /weather/dist ./dist

ENV PERSISTENCE_LOCATION=/data

VOLUME /data

CMD ["npm", "run", "start"]
