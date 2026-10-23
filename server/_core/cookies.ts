import type { CookieOptions, Request } from "express";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isIpAddress(host: string) {
  // Basic IPv4 check and IPv6 presence detection.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(":");
}

function isSecureRequest(req: Request) {
  // With trust proxy enabled, req.protocol already reflects the forwarded protocol.
  if (req.protocol === "https") return true;
  // Fallback: check x-forwarded-proto header directly.
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");
  return protoList.some(proto => proto.trim().toLowerCase() === "https");
}
function isLocalhost(req: Request) {
  return LOCAL_HOSTS.has(req.hostname);
}
export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  // When running behind the Manus proxy (production/preview), always use
  // secure + sameSite=none so the cookie is accepted cross-origin.
  // On localhost (dev), sameSite=lax and secure=false is fine.
  const secure = isLocalhost(req) ? isSecureRequest(req) : true;
  const sameSite = isLocalhost(req) ? ("lax" as const) : ("none" as const);
  return {
    httpOnly: true,
    path: "/",
    sameSite,
    secure,
  };
}
