FROM node:16

WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3000

CMD [ "node", "app.js" ]

LABEL version="20240705"

LABEL description="pdf-convert for Hubspot"
