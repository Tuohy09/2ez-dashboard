FROM node:22-alpine
WORKDIR /app

# coreutils gives GNU df (busybox df lacks `-B1` used by /sys-api/fs)
RUN apk add --no-cache coreutils

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm install --production

# Copy pre-built frontend and the server
COPY dist/ ./dist/
COPY server.js sys-metrics.js ./

EXPOSE 3080
CMD ["node", "server.js"]
