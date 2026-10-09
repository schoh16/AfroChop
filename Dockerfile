FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

EXPOSE 19000 19001 19002 8081

CMD ["npm", "run", "web", "--", "--host", "0.0.0.0"]
