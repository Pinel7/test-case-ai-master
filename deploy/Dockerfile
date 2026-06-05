# Stage 1: Frontend build
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY vite.config.js ./
COPY app/static/js/ ./app/static/js/
RUN npm run build

# Stage 2: Python runtime
FROM python:3.12-slim

WORKDIR /app

ENV TZ=Asia/Shanghai
RUN apt-get update -qq && apt-get install -y -qq tzdata > /dev/null 2>&1 && rm -rf /var/lib/apt/lists/*

ARG PIP_INDEX_URL=https://pypi.org/simple/

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
COPY --from=builder /app/app/static/dist/ ./app/static/dist/

RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app

COPY deploy/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/entrypoint.sh"]
