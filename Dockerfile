# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

# ---- deps: install with the lockfile, no scripts -------------------------------------
# `--ignore-scripts` because at this point there is no source in the image, so
# the `postinstall` hook (`prisma skills sync || exit 0`) has nothing to sync.
# The native builds pnpm is allowed to run come from `onlyBuiltDependencies` in
# .npmrc, whose packages ship prebuilt binaries, so skipping scripts here does
# not leave them without one.
FROM base AS deps
WORKDIR /app
# The manifests must be in the image BEFORE installing. Without this copy the
# stage runs `pnpm install` against an empty directory and dies with
# ERR_PNPM_NO_LOCKFILE — and corepack, having no package.json to read
# `packageManager` from, silently falls back to its own default pnpm version
# rather than the pinned one.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile --ignore-scripts

# ---- build --------------------------------------------------------------------------
FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# These are THROWAWAY placeholders and are never baked into the runtime stage.
# They are mandatory rather than optional: `src/prisma/db.ts` calls
# `postgres({ contractJson, url: process.env['DATABASE_URL']! })` at module
# scope, and the `!` is a compile-time-only claim. `next build` imports route
# modules, so with DATABASE_URL undefined the import throws. The runner stage
# copies only public/, .next/standalone and .next/static — every real value is
# injected by the platform at run time.
#
# If a build fails here with a Prisma/connection error, check this block first.
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
ENV DIRECT_URL=postgresql://build:build@127.0.0.1:5432/build
ENV KINDE_CLIENT_ID=build
ENV KINDE_CLIENT_SECRET=build
ENV KINDE_ISSUER_URL=https://build.invalid
ENV KINDE_SITE_URL=http://localhost:3000
ENV KINDE_POST_LOGIN_REDIRECT_URL=http://localhost:3000/api/auth/sync
ENV KINDE_POST_LOGOUT_REDIRECT_URL=http://localhost:3000
ENV BACKEND_URL=http://127.0.0.1:8000
RUN pnpm build

# ---- runtime: standalone output only -------------------------------------------------
# bookworm-slim (glibc), not Alpine: the dep tree pulls in sharp, rive-app and
# @xyflow/react, and musl means different native binaries or a libc-compat
# layer. The runner needs no pnpm — server.js is plain Node; `corepack` is
# inherited from base but unused, which is harmless.
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

# Never copy the whole /app here. `standalone` exists so the image is a
# server.js plus static assets; copying everything reintroduces the full
# node_modules and bloats the image by hundreds of MB. The .next/static copy is
# NOT optional — omitting it yields HTML with no CSS and a wall of 404s.
COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
