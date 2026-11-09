/**
 * The web build lives under siwiapp.shop/app, but native routes have no "/app" prefix.
 * Maps App Links such as https://siwiapp.shop/app/tv-connect?code=ABCD-EFGH to /tv-connect.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    const url = new URL(path);
    if (url.protocol === "https:" && /(^|\.)siwiapp\.shop$/.test(url.hostname)) {
      const route = url.pathname.replace(/^\/app(?=\/|$)/, "") || "/";
      return `${route}${url.search}`;
    }
  } catch {
    // Not an absolute URL (already an in-app path).
  }
  return path;
}
