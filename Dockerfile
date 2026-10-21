FROM node:22-alpine

WORKDIR /app

# Copiar archivos del proyecto
COPY package*.json ./
COPY server.js config.json crear-usuario.js ./
COPY public/ ./public/

# Directorio para la base de datos persistente
RUN mkdir -p /app/data

ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "--experimental-sqlite", "server.js"]
