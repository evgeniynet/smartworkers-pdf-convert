FROM node:16

WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3000
ENV PORT 3000

CMD [ "yarn", "start" ]

LABEL version="20240705"

LABEL description="pdf-convert for Hubspot"
