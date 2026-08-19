FROM node:22-bookworm-slim

WORKDIR /app/website-part

COPY website-part/package.json website-part/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY website-part/ ./

# The database configuration is supplied as a read-only runtime mount at
# /app/shared/database/config.json. The Discord bot is not copied into this image.
RUN mkdir -p /app/shared/database

ENV NODE_ENV=production \
    PORT=3000 \
    BIND_IP=0.0.0.0

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/login.html').then(response => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "src/server.js"]
