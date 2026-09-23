FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN npm install -g pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm typecheck && pnpm build

FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
RUN npm install -g pnpm@11.25.0
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY --from=build /app/dist ./dist
COPY --from=build /app/packages/database/migrations ./packages/database/migrations
USER node
EXPOSE 3000
CMD ["node", "dist/apps/backend/main.js"]
