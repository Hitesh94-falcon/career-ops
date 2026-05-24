FROM node:18-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
RUN npx playwright install chromium
COPY . .
CMD ["npm", "run", "scan"]
