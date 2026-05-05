FROM node:22-bookworm-slim AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm install

COPY frontend/index.html ./
COPY frontend/vite.config.js ./
COPY frontend/src ./src

RUN npm run build

FROM node:22-bookworm-slim

WORKDIR /app/backend

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY backend/package*.json ./
RUN npm install

COPY backend/src ./src
COPY --from=frontend-builder /app/frontend/dist ../frontend/dist

RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "src/server.js"]
