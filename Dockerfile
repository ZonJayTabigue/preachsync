FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    fonts-liberation \
    libreoffice-impress \
    poppler-utils \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/host/package.json apps/host/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci

COPY . .

RUN npm run build

ENV NODE_ENV=production
ENV HOST=0.0.0.0

EXPOSE 4000

CMD ["npm", "start"]
