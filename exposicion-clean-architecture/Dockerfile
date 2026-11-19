# Una sola imagen para los dos servicios (Reservas y Notificaciones).
# Qué servicio arranca lo decide el compose con "command".
FROM node:24-slim

# Carpeta de trabajo dentro del contenedor.
WORKDIR /app

# 1) Primero solo los archivos de dependencias, para aprovechar la caché:
#    si no cambian, Docker no vuelve a correr npm ci en cada build.
COPY package.json package-lock.json ./
RUN npm ci

# 2) Después el código y las pruebas.
COPY tsconfig.json ./
COPY src ./src
COPY test ./test

# Puertos que usan los servicios (3000 Reservas, 3001 Notificaciones).
EXPOSE 3000 3001

# Por defecto arranca Reservas. En la versión B, el compose lo cambia
# para el contenedor de Notificaciones.
CMD ["npm", "run", "start:reservas"]
