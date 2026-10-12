/** The same public image paths are used by the PWA and the deployment uploader. */
export const mediaFolders = [
  "brand", "characters", "dashboard-preview", "story", "story-choose", "story-finale",
  "story-first", "story-interests", "story-lika", "story-max", "story-v2",
] as const;

export function publicMediaKey(path: string): string | null {
  const match = /^\/?([a-z-]+)\/([a-z0-9-]+\.(?:webp|png|jpg|svg))$/.exec(path);
  if (!match || !mediaFolders.some(folder => folder === match[1])) return null;
  return `${match[1]}/${match[2]}`;
}

export function mediaOrigin(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash)
      return null;
    if (url.hostname !== "s3.twcstorage.ru" || !/^\/[a-z0-9-]+\/?$/.test(url.pathname)) return null;
    url.pathname = url.pathname.replace(/\/?$/, "/");
    return url;
  } catch { return null; }
}
