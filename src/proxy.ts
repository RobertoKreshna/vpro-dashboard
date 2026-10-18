import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const PUBLIC_PREFIXES = ["/listings-public", "/login", "/geo", "/api/telegram", "/robots.txt", "/sitemap.xml"];

export async function proxy(request: NextRequest) {
  // Public pages hit the database on every load: cap requests per IP (a speed bump; see lib/rate-limit.ts).
  if (request.nextUrl.pathname.startsWith("/listings-public")) {
    const rl = rateLimit(`public:${clientIp(request.headers)}`, 240, 60_000);
    if (!rl.ok) {
      return new NextResponse("Too many requests. Please slow down.", { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
    }
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(list) {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // getUser() validates the token with Supabase Auth (getSession() would not).
  const { data } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));

  const staff = data.user?.app_metadata?.role === "staff";

  if (!data.user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/") url.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  // Signed in but not staff (e.g. someone who signed up): sign them out and send them to the login page.
  if (data.user && !staff && !isPublic) {
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "?error=not-staff";
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }
  if (data.user && staff && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  // /geo/* are public boundary tiles: skip the proxy so each one doesn't cost a Supabase Auth round trip.
  matcher: ["/((?!_next/static|_next/image|geo/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
