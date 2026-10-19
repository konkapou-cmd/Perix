FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts/ ./scripts/
RUN npm ci
COPY . .
RUN node scripts/patch-reanimated.js && EXPO_NO_MINIFY=1 npx expo export --platform web --clear

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
