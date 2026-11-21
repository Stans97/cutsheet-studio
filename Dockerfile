FROM node:24-slim

WORKDIR /app
COPY package.json server.js ./
COPY src ./src
COPY public ./public

ENV NODE_ENV=production
ENV PORT=3780
ENV HOST=0.0.0.0
ENV DATA_DIR=/app/data

RUN mkdir -p /app/data
EXPOSE 3780

CMD ["node", "server.js"]
