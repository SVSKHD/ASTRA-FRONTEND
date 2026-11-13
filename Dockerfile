# syntax=docker/dockerfile:1
# Stage 1: Build Vue application
FROM node:22-alpine AS builder

WORKDIR /app

# The repository uses pnpm (pnpm-lock.yaml; there is no package-lock.json, so
# `npm ci` cannot run). Same pnpm major as scripts/deploy.sh.
# bash and git: only the full verification (VERIFY=1 below) needs them, for
# the deploy-script tests (src/ops/deployScript.test.ts), which drive
# scripts/deploy.sh with bash against throwaway git repositories.
RUN apk add --no-cache bash git \
  && npm install -g pnpm@9
ENV CI=true

# Install locked dependencies. The pnpm store is a BuildKit cache, so a rebuild
# only downloads packages the lockfile added; this layer itself is reused until
# package.json or pnpm-lock.yaml changes.
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=astra-pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile --store-dir /pnpm/store

# Copy frontend source (.dockerignore keeps node_modules, dist and local .env files out)
COPY . .

# The build stamp (/version.json and the in-app build badge) names the commit it
# was built from. .git is not in the build context, so pass it in:
#   docker build --build-arg COMMIT_REF="$(git rev-parse HEAD)" --build-arg BRANCH="$(git rev-parse --abbrev-ref HEAD)" .
# Without them the stamp reads "unknown" rather than guessing.
ARG COMMIT_REF=""
ARG BRANCH=""
ENV COMMIT_REF=$COMMIT_REF BRANCH=$BRANCH

# Build. By default: type-check (vue-tsc) and the production build only.
# The full verification (format, stylelint, type-check and the ~4,200 vitest
# tests) already runs on every pull request and every dev01 push in GitHub
# Actions (.github/workflows/ci.yml), and takes about nine minutes here, so the
# image does not repeat it. To run it anyway:
#   docker build --build-arg VERIFY=1 .
ARG VERIFY=0
RUN if [ "$VERIFY" = "1" ]; then pnpm build; else pnpm build:only; fi

# Stage 2: Serve the application
FROM nginx:stable-alpine AS production

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy ONLY compiled frontend files
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
