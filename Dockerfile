FROM node:20-slim

WORKDIR /app

# Backend dependencies
COPY backend/package.json backend/package-lock.json* ./backend/
RUN cd backend && npm install --omit=dev

# Backend source + the static frontend it serves (see src/app.js)
COPY backend/src ./backend/src
COPY frontend ./frontend

WORKDIR /app/backend
ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/index.js"]
