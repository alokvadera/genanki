/**
 * Client request metadata — the equivalent of Convex's
 * `ctx.meta.getRequestMetadata()` used by the original actions.
 *
 * The Neon Function sits behind a proxy that sets standard forwarding
 * headers; fall back through them and finally to loopback (matching the
 * original `"127.0.0.1"` default).
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    "127.0.0.1"
  );
}
