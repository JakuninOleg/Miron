import { describe, expect, it } from "vitest";
import { mediaOrigin, publicMediaKey } from "./public-path";

describe("public S3 boundary", () => {
  it("accepts only public art, never account/API paths or traversal", () => {
    expect(publicMediaKey("/story-first/mobile-v2.webp")).toBe("story-first/mobile-v2.webp");
    for (const path of ["api/account.png", "story/../.env", "story/%2e%2e/env.png", "story/image.webp?owner=42", "story/private/avatar.png", "story/test.html"]) {
      expect(publicMediaKey(path)).toBeNull();
    }
  });
  it("rejects arbitrary upstreams, credentials, queries and non-HTTPS", () => {
    expect(mediaOrigin("https://s3.twcstorage.ru/miron-beta-public")?.href).toBe("https://s3.twcstorage.ru/miron-beta-public/");
    for (const value of ["https://example.com/bucket", "http://s3.twcstorage.ru/bucket", "https://user:password@s3.twcstorage.ru/bucket", "https://s3.twcstorage.ru/bucket?key=secret", "https://s3.twcstorage.ru/bucket/../other/file", "https://s3.twcstorage.ru:444/bucket"]) {
      expect(mediaOrigin(value)).toBeNull();
    }
  });
});
