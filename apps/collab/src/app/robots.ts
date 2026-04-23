import type { MetadataRoute } from "next";

const SITE = "https://craftstack-collab.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/playground", "/docs", "/docs/api", "/status"],
        disallow: [
          "/dashboard",
          "/w/",
          "/workspaces/",
          "/api/",
          "/invite/",
          "/signin",
        ],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
