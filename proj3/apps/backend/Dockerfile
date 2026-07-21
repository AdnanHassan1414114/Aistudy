FROM node:20-slim AS base

# ffmpeg for audio optimization, python3/pip for yt-dlp
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg python3 python3-pip curl ca-certificates \
    && pip3 install --no-cache-dir --break-system-packages yt-dlp \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm install

COPY . .
RUN npx prisma generate
RUN npm run build

RUN mkdir -p /app/temp /app/logs

EXPOSE 4000

CMD ["npm", "run", "start"]
