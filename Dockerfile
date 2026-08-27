# UZA — TanStack Start application, production image.
#
#   docker build -t uza-<app>:latest \
#     --build-arg VITE_SUPABASE_URL=https://<project>.supabase.co \
#     --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_... .
#
# Identical across uza-charge, evfleet and battery-life: same starter, same toolchain,
# same output shape. Keep them identical — three subtly different Dockerfiles is three
# things to debug at three in the morning.
#
# ── The one thing to understand before editing ───────────────────────────────────────
#
# There are TWO kinds of credential here and they are not interchangeable.
#
#   VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY
#       Vite inlines anything prefixed VITE_ into the CLIENT bundle at BUILD time.
#       They must therefore be build args. This is safe: a publishable key is public
#       by design — it ships to every browser regardless, and row-level security, not
#       secrecy, is what protects the data behind it.
#
#   SUPABASE_SERVICE_ROLE_KEY
#       Read by src/integrations/supabase/client.server.ts and it bypasses row-level
#       security entirely. It is a real secret. It is passed at RUN time only.
#       NEVER make it a build arg — build args are recorded in the image's history and
#       survive in any registry the image is pushed to.
#
# Nitro's node-server preset traces its own dependencies into .output, so the runtime
# stage needs .output and nothing else — no node_modules, no package.json, no install.

# ---------------------------------------------------------------- build
FROM node:22-alpine AS build
WORKDIR /app

# Dependencies first, so editing a component does not reinstall the world.
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

COPY . .

# Public, and inlined into the client bundle. See the note above.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY

# Fail here rather than serving a page whose only symptom is an empty screen and a
# console error nobody is looking at.
RUN test -n "$VITE_SUPABASE_URL" || (echo "VITE_SUPABASE_URL build arg is required" && exit 1)
RUN test -n "$VITE_SUPABASE_PUBLISHABLE_KEY" || (echo "VITE_SUPABASE_PUBLISHABLE_KEY build arg is required" && exit 1)

# The default preset is cloudflare — it is what Lovable deploys to. node_server is what
# runs in a container. Setting it here rather than in vite.config.ts leaves the Lovable
# path working unchanged.
ENV NITRO_PRESET=node_server
RUN npm run build

# ---------------------------------------------------------------- runtime
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# The node image ships a non-root user. Use it rather than inventing another.
COPY --from=build --chown=node:node /app/.output ./.output

USER node
EXPOSE 3000

# SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are supplied at run time by compose.
CMD ["node", ".output/server/index.mjs"]
