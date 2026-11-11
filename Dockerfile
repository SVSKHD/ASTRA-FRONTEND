# Stage 1: Build Vue application
FROM node:22-alpine AS builder

WORKDIR /app

# The repository uses pnpm (pnpm-lock.yaml; there is no package-lock.json, so
# `npm ci` cannot run). Same pnpm major as scripts/deploy.sh.
# bash and git: `pnpm build` runs the full verification, and its deploy-script
# tests (src/ops/deployScript.test.ts) drive scripts/deploy.sh with bash
# against throwaway git repositories.
RUN apk add --no-cache bash git \
  && npm install -g pnpm@9
ENV CI=true

# Install locked dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy frontend source (.dockerignore keeps node_modules, dist and local .env files out)
COPY . .

# The build stamp (/version.json and the in-app build badge) names the commit it
# was built from. .git is not in the build context, so pass it in:
#   docker build --build-arg COMMIT_REF="$(git rev-parse HEAD)" --build-arg BRANCH="$(git rev-parse --abbrev-ref HEAD)" .
# Without them the stamp reads "unknown" rather than guessing.
ARG COMMIT_REF=""
ARG BRANCH=""
ENV COMMIT_REF=$COMMIT_REF BRANCH=$BRANCH

# Run production build and verification (format, stylelint, type-check, tests, then vite build)
RUN pnpm build

# Stage 2: Serve the application
FROM nginx:stable-alpine AS production

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy ONLY compiled frontend files
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
