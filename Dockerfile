FROM node:22-alpine AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY index.html vite.config.js ./
COPY src/ ./src/
COPY public/ ./public/
RUN npm run build

FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache coreutils bash docker-cli docker-cli-compose
COPY package.json package-lock.json ./
RUN apk add --no-cache --virtual .build-deps python3 make g++ linux-headers \
 && npm ci --omit=dev \
 && apk del .build-deps
COPY --from=frontend /app/dist/ ./dist/
COPY server.js sys-metrics.js stack-manager.js qbt-proxy.js unmanic-proxy.js docker-manager.js file-browser-proxy.js arr-proxy.js access-policy.js terminal-server.js download-stream.js widget-proxy.js upstream-proxy.js ./
EXPOSE 3080
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD node -e "fetch('http://127.0.0.1:3080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
