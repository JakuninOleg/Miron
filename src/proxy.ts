import { NextResponse, type NextRequest } from "next/server";
import { mediaOrigin, publicMediaKey } from "./server/media/public-path";

export function proxy(request: NextRequest) {
  const key = publicMediaKey(request.nextUrl.pathname);
  if (!key || !mediaOrigin(process.env.MIRON_MEDIA_ORIGIN)) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = `/public-media/${key}`;
  url.search = "";
  return NextResponse.rewrite(url);
}
export const config = {
  matcher: ["/brand/:path*", "/characters/:path*", "/dashboard-preview/:path*", "/story/:path*",
    "/story-choose/:path*", "/story-finale/:path*", "/story-first/:path*",
    "/story-interests/:path*", "/story-lika/:path*", "/story-max/:path*", "/story-v2/:path*"],
};
