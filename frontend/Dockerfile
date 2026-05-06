FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY index.html ./
COPY public ./public
COPY vite.config.js ./
COPY src ./src

EXPOSE 5173

CMD ["./node_modules/.bin/vite", "--host", "0.0.0.0"]
