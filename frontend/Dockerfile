FROM node:24-alpine

# pnpm той версии, что указана в packageManager в package.json
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

EXPOSE 5173

# --host: дев-сервер должен слушать не только localhost внутри контейнера
CMD ["pnpm", "dev", "--host", "0.0.0.0"]
