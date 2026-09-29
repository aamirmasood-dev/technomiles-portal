import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

// Optimistic check only: pages and actions still call requireUser().
const PUBLIC_PATHS = ["/login", "/api/cron/"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const token = request.cookies.get("tm_session")?.value;
  if (token) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.SESSION_SECRET), {
        algorithms: ["HS256"],
      });
      return NextResponse.next();
    } catch {
      // fall through to login
    }
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
