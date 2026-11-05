# syntax=docker/dockerfile:1
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=3000

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src

# /data (SQLite + imágenes) debe pertenecer al usuario sin privilegios antes de declararlo volumen.
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME /data
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3000/api/health || exit 1

# node:sqlite avisa que es experimental; se silencia solo ese aviso.
CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.ts"]
