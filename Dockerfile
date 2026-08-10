FROM node:22-alpine
WORKDIR /app

# Runtime tools: coreutils gives GNU df (busybox df lacks `-B1` used by
# /sys-api/fs); bash is the shell spawned by the /terminal WebSocket.
RUN apk add --no-cache coreutils bash

# Install production dependencies only. node-pty is a native addon, so a
# build toolchain is needed to compile it — installed as a virtual
# package and removed afterwards to keep the image small.
COPY package.json package-lock.json ./
RUN apk add --no-cache --virtual .build-deps python3 make g++ linux-headers \
 && npm install --production \
 && apk del .build-deps

# Copy pre-built frontend and the server
COPY dist/ ./dist/
COPY server.js sys-metrics.js ./

EXPOSE 3080
CMD ["node", "server.js"]
