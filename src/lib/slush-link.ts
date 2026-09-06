// iPhones have no browser extensions, so the only wallet a phone can reach is
// Slush. This builds the universal link that opens a page inside the Slush app's
// own browser, where the wallet is injected and connect works normally.
//
// The route is a raw path segment, not a query parameter: my.slush.app/browse/<url>.
// Any query or hash on our own URL is dropped, because Slush would read it as its own.
export function slushBrowseUrl(href: string): string {
  const url = new URL(href);
  return `https://my.slush.app/browse/${url.origin}${url.pathname}`;
}

export function isIosUserAgent(userAgent: string): boolean {
  return /iPad|iPhone|iPod/.test(userAgent);
}
