import { useEffect } from "react";

interface SEOHeadProps {
  title: string;
  description: string;
  canonical: string;
  ogImage?: string;
}

/**
 * Dynamically sets <title>, meta description, canonical, and OG tags.
 * Cleans up on unmount by restoring defaults.
 */
export default function SEOHead({ title, description, canonical, ogImage = "https://snapignite.com/og-image.png" }: SEOHeadProps) {
  useEffect(() => {
    // Title
    document.title = title;

    // Meta description
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute("content", description);

    // Canonical
    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    link.href = canonical;

    // OG tags
    const ogTags: Record<string, string> = {
      "og:title": title,
      "og:description": description,
      "og:url": canonical,
      "og:image": ogImage,
    };

    for (const [property, content] of Object.entries(ogTags)) {
      let tag = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
      if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute("property", property);
        document.head.appendChild(tag);
      }
      tag.setAttribute("content", content);
    }

    // Twitter tags
    const twitterTags: Record<string, string> = {
      "twitter:title": title,
      "twitter:description": description,
      "twitter:image": ogImage,
    };

    for (const [name, content] of Object.entries(twitterTags)) {
      let tag = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
      if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute("name", name);
        document.head.appendChild(tag);
      }
      tag.setAttribute("content", content);
    }
  }, [title, description, canonical, ogImage]);

  return null;
}
