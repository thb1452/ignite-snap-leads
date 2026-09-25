export const DEFAULT_TITLE = "Snap Ignite | Municipal Enforcement Intelligence";
export const DEFAULT_DESCRIPTION = "Municipal enforcement intelligence for property research. Customer market access and purchases are paused during relaunch verification.";

export function setMeta(attribute: "name" | "property", key: string, content: string) {
  let tag = document.querySelector(`meta[${attribute}="${key}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attribute, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

export function resetPageMetadata() {
  document.title = DEFAULT_TITLE;
  setMeta("name", "description", DEFAULT_DESCRIPTION);
  for (const prefix of ["og", "twitter"]) {
    const attr = prefix === "og" ? "property" : "name";
    setMeta(attr, `${prefix}:title`, DEFAULT_TITLE);
    setMeta(attr, `${prefix}:description`, DEFAULT_DESCRIPTION);
    setMeta(attr, `${prefix}:image`, "https://snapignite.com/og-image.png");
  }
  document.querySelector('link[rel="canonical"]')?.remove();
  document.querySelector('meta[property="og:url"]')?.remove();
}
