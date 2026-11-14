// The announcement link points only to a page on the same domain as the company.
// Otherwise we point to the changelog page, because the LLM may make up a wrong link.

const apex = (host) => host.split('.').slice(-2).join('.');

export function safeLink(candidate, base) {
  try {
    const b = new URL(base);
    if (!candidate) return base;
    const u = new URL(candidate);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return base;
    return apex(u.hostname) === apex(b.hostname) ? u.href : base;
  } catch {
    return base;
  }
}
