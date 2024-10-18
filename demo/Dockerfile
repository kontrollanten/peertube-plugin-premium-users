FROM node:20-alpine

RUN apk add --update \
    curl dpkg\
    && rm -rf /var/cache/apk/*

RUN wget https://github.com/stripe/stripe-cli/releases/download/v1.21.9/stripe_1.21.9_linux_x86_64.tar.gz && tar -xvf *.gz && mv stripe /bin/

RUN npm install -g @peertube/peertube-cli

VOLUME /app
COPY ../ /app
WORKDIR /app
RUN npm ci && npm run build && npm pack
WORKDIR /app/demo
RUN npm ci

ENTRYPOINT [ "npx" ]
CMD [ "ts-node", "prepare-plugin" ]
