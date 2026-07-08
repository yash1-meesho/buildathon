FROM node:20-alpine

ENV TZ=Asia/Kolkata
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
