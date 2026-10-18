const CACHE = "miron-shell-v10";
const DEVELOPMENT = new URL(self.location.href).searchParams.has("dev");
const PAGES = [
  "/dashboard",
  "/onboarding",
  "/workout",
  "/programs",
  "/progress",
  "/settings",
  "/chat",
];
const ASSETS = [
  "/offline.html",
  "/site.webmanifest",
  "/favicon.ico",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-192.png",
  "/icons/icon-maskable-512.png",
  "/apple-touch-icon.png",
  "/characters/max.webp",
  "/characters/lika.webp",
  "/characters/max-avatar.webp",
  "/characters/lika-avatar.webp",
  "/brand/mark.webp",
  "/brand/wordmark.webp",
  "/visuals/soft-3d/max.webp",
  "/visuals/soft-3d/dashboard/max-desktop-v1.webp",
  "/visuals/soft-3d/dashboard/lika-desktop-v1.webp",
  "/visuals/soft-3d/dashboard/max-mobile-v1.webp",
  "/visuals/soft-3d/dashboard/lika-mobile-v1.webp",
  "/visuals/soft-3d/scenes/welcome-v2.webp",
  "/visuals/soft-3d/journey/first-route-v1.webp",
  "/visuals/soft-3d/journey/own-trail-v1.webp",
  "/visuals/soft-3d/journey/further-together-v1.webp",
  "/visuals/soft-3d/scenes/welcome-mobile-v2.webp",
  "/visuals/soft-3d/scenes/max-v2.webp",
  "/visuals/soft-3d/scenes/lika-v2.webp",
  "/visuals/soft-3d/scenes/max-mobile-v2.webp",
  "/visuals/soft-3d/scenes/lika-mobile-v2.webp",
  "/visuals/soft-3d/scenes/interests-v2.webp",
  "/visuals/soft-3d/scenes/interests-mobile-v2.webp",
  "/visuals/soft-3d/scenes/choose-v2.webp",
  "/visuals/soft-3d/scenes/choose-mobile-v2.webp",
  "/visuals/soft-3d/scenes/prepare-v2.webp",
  "/visuals/soft-3d/scenes/prepare-mobile-v2.webp",
  "/visuals/soft-3d/scenes/finish-v2.webp",
  "/visuals/soft-3d/scenes/finish-mobile-v2.webp",
  "/visuals/soft-3d/lika.webp",
  "/visuals/soft-3d/gym.webp",
  "/visuals/soft-3d/home.webp",
  "/visuals/soft-3d/park.webp",
  "/visuals/soft-3d/yoga.webp",
  "/visuals/soft-3d/mobility.webp",
  "/visuals/soft-3d/fitness.webp",
  "/visuals/soft-3d/preparation.webp",
  "/visuals/soft-3d/finish.webp",
  "/visuals/soft-3d/equipment/dumbbell.webp",
  "/visuals/soft-3d/equipment/kettlebell.webp",
  "/visuals/soft-3d/equipment/barbell.webp",
  "/visuals/soft-3d/equipment/band.webp",
  "/visuals/soft-3d/equipment/bench.webp",
  "/visuals/soft-3d/equipment/mat.webp",
  "/visuals/soft-3d/equipment/block.webp",
  "/visuals/soft-3d/equipment/strap.webp",
  "/visuals/soft-3d/equipment/bolster.webp",
  "/visuals/soft-3d/equipment/blanket.webp",
  "/visuals/soft-3d/equipment/roller.webp",
  "/visuals/soft-3d/equipment/rings.webp",
  "/visuals/soft-3d/equipment/pullup.webp",
  "/visuals/soft-3d/equipment/parallettes.webp",
  "/visuals/soft-3d/equipment/vest.webp",
  "/visuals/soft-3d/equipment/belt.webp",
  "/visuals/soft-3d/equipment/backpack.webp",
];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const current = await caches.open(CACHE);
      // Keep the previously downloaded shell usable during an app update.
      // Installation alone downloads branding, not all page dependencies.
      for (const name of (await caches.keys()).reverse()) {
        if (!name.startsWith("miron-shell-") || name === CACHE) continue;
        const previous = await caches.open(name);
        for (const request of await previous.keys()) {
          const url = new URL(request.url);
          const publicAsset =
            url.origin === self.location.origin &&
            (PAGES.includes(url.pathname) ||
              ASSETS.includes(url.pathname) ||
              url.pathname.startsWith("/_next/static/"));
          if (!publicAsset || (await current.match(request, { ignoreVary: true }))) continue;
          const response = await previous.match(request, { ignoreVary: true });
          if (response) await current.put(request, response);
        }
        await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "PRECACHE_WORKOUT")
    event.waitUntil(
      (async () => {
        try {
          const cache = await caches.open(CACHE);
          await cache.addAll(ASSETS);
          const dependencies = new Set();
          for (const page of PAGES) {
            const response = await fetch(page, { cache: "no-cache" });
            if (!response.ok) throw new Error("Page unavailable");
            const html = await response.clone().text();
            await cache.put(page, response);
            for (const match of html.matchAll(/\/_next\/static\/[^\s"'\\<>]+/g))
              dependencies.add(match[0]);
          }
          for (const path of dependencies) {
            const response = await fetch(path, { cache: "no-cache" });
            if (!response.ok) throw new Error("Asset unavailable");
            if (path.endsWith(".css")) {
              const css = await response.clone().text();
              for (const match of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
                const font = new URL(match[1], new URL(path, self.location.origin));
                if (
                  font.origin === self.location.origin &&
                  font.pathname.startsWith("/_next/static/")
                )
                  dependencies.add(font.pathname);
              }
            }
            await cache.put(path, response);
          }
          const loaded = await cache.keys();
          event.ports[0]?.postMessage({ ok: true, files: loaded.length });
        } catch {
          event.ports[0]?.postMessage({ ok: false });
        }
      })(),
    );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/image") ||
    url.searchParams.has("_rsc") ||
    event.request.headers.get("RSC")
  )
    return;
  if (event.request.mode === "navigate") {
    // Older installed manifests started at /. Keep that entry usable offline too.
    if (url.pathname === "/") {
      event.respondWith(
        fetch(event.request).catch(() =>
          Response.redirect(new URL("/dashboard", url.origin), 302),
        ),
      );
      return;
    }
    // These documents contain the public client shell only. Private state is fetched
    // from authenticated no-store APIs and lives in account-keyed IndexedDB.
    if (!PAGES.includes(url.pathname)) return;
    event.respondWith(
      fetch(event.request)
        .then(async (response) => {
          if (response.ok) await (await caches.open(CACHE)).put(event.request, response.clone());
          return response;
        })
        .catch(
          async () =>
            (await caches.match(url.pathname, { ignoreVary: true })) ||
            (await caches.match("/offline.html", { ignoreVary: true })),
        ),
    );
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || ASSETS.includes(url.pathname)) {
    const network = () =>
      fetch(event.request).then(async (response) => {
        if (response.ok) await (await caches.open(CACHE)).put(event.request, response.clone());
        return response;
      });
    // Precache requests and browser requests have different Accept-Encoding headers.
    // Only public shell assets reach here; private API responses are excluded above.
    const cached = () => caches.match(event.request, { ignoreVary: true });
    event.respondWith(
      DEVELOPMENT
        ? network().catch(async () => (await cached()) || Response.error())
        : cached().then((response) => response || network()),
    );
  }
});
