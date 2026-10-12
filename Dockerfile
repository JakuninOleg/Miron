FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS builder
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build:deploy

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 MIRON_STANDALONE=true
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/data/catalog ./data/catalog
COPY --from=builder --chown=nextjs:nodejs /app/.deploy ./.deploy
COPY --from=builder --chown=nextjs:nodejs /app/scripts/deploy/start.mjs ./scripts/deploy/start.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/deploy/healthcheck.mjs ./scripts/deploy/healthcheck.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/deploy/timeweb-ca.crt ./scripts/deploy/timeweb-ca.crt
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=8s --start-period=60s --retries=4 CMD ["node", "scripts/deploy/healthcheck.mjs"]
CMD ["node", "scripts/deploy/start.mjs"]
