/**
 * Dynamic Sitemap Generator
 * 
 * Queries all jurisdictions from the database and generates a complete
 * XML sitemap including static pages and all 4,000+ city pages.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const BASE_URL = "https://snapignite.com";

const STATIC_PAGES = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/pricing", changefreq: "monthly", priority: "0.9" },
  { path: "/code-violations", changefreq: "weekly", priority: "0.9" },
  { path: "/code-violation-leads", changefreq: "monthly", priority: "0.8" },
  { path: "/distressed-property-data", changefreq: "monthly", priority: "0.8" },
  { path: "/code-enforcement-data", changefreq: "monthly", priority: "0.8" },
  { path: "/municipal-enforcement-data", changefreq: "monthly", priority: "0.8" },
  { path: "/off-market-property-leads", changefreq: "monthly", priority: "0.8" },
  { path: "/real-estate-distress-signals", changefreq: "monthly", priority: "0.8" },
  { path: "/how-investors-find-distressed-properties", changefreq: "monthly", priority: "0.8" },
  { path: "/about", changefreq: "monthly", priority: "0.6" },
  { path: "/blog", changefreq: "weekly", priority: "0.7" },
  { path: "/privacy", changefreq: "yearly", priority: "0.3" },
  { path: "/terms", changefreq: "yearly", priority: "0.3" },
];

function cityToSlug(city: string): string {
  return city.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch all jurisdictions (paginate past the 1000 row default limit)
    const allJurisdictions: { city: string; state: string }[] = [];
    let from = 0;
    const PAGE_SIZE = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from("jurisdictions")
        .select("city, state")
        .order("city")
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw error;

      if (data && data.length > 0) {
        allJurisdictions.push(...data);
        from += PAGE_SIZE;
        hasMore = data.length === PAGE_SIZE;
      } else {
        hasMore = false;
      }
    }

    console.log(`[dynamic-sitemap] Fetched ${allJurisdictions.length} jurisdictions`);

    // Deduplicate by slug (some cities may appear with slight variations)
    const seenSlugs = new Set<string>();
    const uniqueCities: { slug: string }[] = [];

    for (const j of allJurisdictions) {
      const slug = `${cityToSlug(j.city)}-${j.state.toLowerCase()}`;
      if (!seenSlugs.has(slug)) {
        seenSlugs.add(slug);
        uniqueCities.push({ slug });
      }
    }

    const today = new Date().toISOString().split("T")[0];

    // Build XML
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

    // Static pages
    for (const page of STATIC_PAGES) {
      xml += `  <url>\n`;
      xml += `    <loc>${escapeXml(`${BASE_URL}${page.path}`)}</loc>\n`;
      xml += `    <changefreq>${page.changefreq}</changefreq>\n`;
      xml += `    <priority>${page.priority}</priority>\n`;
      xml += `  </url>\n`;
    }

    // Dynamic city pages
    for (const city of uniqueCities) {
      xml += `  <url>\n`;
      xml += `    <loc>${escapeXml(`${BASE_URL}/code-violations/${city.slug}`)}</loc>\n`;
      xml += `    <lastmod>${today}</lastmod>\n`;
      xml += `    <changefreq>weekly</changefreq>\n`;
      xml += `    <priority>0.7</priority>\n`;
      xml += `  </url>\n`;
    }

    xml += `</urlset>`;

    console.log(`[dynamic-sitemap] Generated sitemap with ${STATIC_PAGES.length + uniqueCities.length} URLs`);

    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("[dynamic-sitemap] Error:", error);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`,
      {
        status: 500,
        headers: { "Content-Type": "application/xml; charset=utf-8" },
      }
    );
  }
});
