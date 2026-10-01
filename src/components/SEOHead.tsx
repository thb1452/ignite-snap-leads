import { useEffect } from "react";
import { setMeta, resetPageMetadata } from "@/lib/pageMetadata";

interface SEOHeadProps {
  title: string;
  description: string;
  canonical: string;
  ogImage?: string;
  noIndex?: boolean;
}

/** Route-specific metadata is removed when leaving the page. */
export default function SEOHead({ title, description, canonical, ogImage = "https://snapignite.com/og-image.png", noIndex }: SEOHeadProps) {
  useEffect(() => {
    document.title = title;
    setMeta("name", "description", description);
    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    link.href = canonical;
    for (const [property, content] of Object.entries({ "og:title": title, "og:description": description, "og:url": canonical, "og:image": ogImage })) setMeta("property", property, content);
    for (const [name, content] of Object.entries({ "twitter:title": title, "twitter:description": description, "twitter:image": ogImage })) setMeta("name", name, content);
    if (noIndex !== undefined) setMeta("name", "robots", noIndex ? "noindex, nofollow" : "index, follow");
    return resetPageMetadata;
  }, [title, description, canonical, ogImage, noIndex]);
  return null;
}
