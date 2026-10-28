import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

function getBaseUrl(request: NextRequest): string {
  const customDomain = process.env.NEXT_PUBLIC_BASE_URL || process.env.DOMAIN;
  if (customDomain) {
    const formatted = customDomain.startsWith("http")
      ? customDomain
      : `https://${customDomain}`;
    return formatted.replace(/\/+$/, "");
  }

  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercelProd) {
    return `https://${vercelProd.replace(/\/+$/, "")}`;
  }

  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) {
    return `https://${vercelUrl.replace(/\/+$/, "")}`;
  }

  return request.nextUrl.origin.replace(/\/+$/, "");
}

interface SiteItem {
  slug: string;
  url: string;
  subpathUrl: string;
  updatedAt?: string;
  source: "github" | "local";
}

export async function GET(request: NextRequest) {
  try {
    const passkey =
      request.headers.get("x-admin-passkey") ||
      request.nextUrl.searchParams.get("passkey") ||
      "";

    const expectedPasskey = process.env.ADMIN_PASSKEY;
    if (expectedPasskey && (!passkey || passkey !== expectedPasskey)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Invalid or missing passkey." },
        { status: 401 }
      );
    }

    const baseUrl = getBaseUrl(request);
    const sitesMap = new Map<string, SiteItem>();

    // 1. Try fetching from GitHub repo if credentials are present
    const githubToken = process.env.GITHUB_TOKEN;
    const githubRepo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || "main";

    if (githubToken && githubRepo) {
      try {
        const ghRes = await fetch(
          `https://api.github.com/repos/${githubRepo}/contents/public/sites?ref=${branch}`,
          {
            headers: {
              Authorization: `Bearer ${githubToken}`,
              Accept: "application/vnd.github.v3+json",
              "User-Agent": "EazyPage-Publisher",
            },
            next: { revalidate: 10 },
          }
        );

        if (ghRes.ok) {
          const contents = await ghRes.json();
          if (Array.isArray(contents)) {
            for (const item of contents) {
              if (item.name === ".gitkeep") continue;

              let slug = item.name;
              if (item.type === "file" && slug.endsWith(".html")) {
                slug = slug.replace(/\.html$/, "");
              }

              if (slug) {
                sitesMap.set(slug, {
                  slug,
                  url: `${baseUrl}/${slug}/`,
                  subpathUrl: `${baseUrl}/sites/${slug}/`,
                  source: "github",
                });
              }
            }
          }
        }
      } catch (err) {
        console.error("Error fetching contents from GitHub:", err);
      }
    }

    // 2. Read local filesystem (for local development or serverless environments with bundled public sites)
    try {
      const sitesDir = path.join(process.cwd(), "public", "sites");
      const entries = await fs.readdir(sitesDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.name === ".gitkeep") continue;

        let slug: string | null = null;
        let updatedAt: string | undefined = undefined;

        if (entry.isDirectory()) {
          slug = entry.name;
          try {
            const stat = await fs.stat(
              path.join(sitesDir, slug, "index.html")
            );
            updatedAt = stat.mtime.toISOString();
          } catch {
            // No index.html inside this directory
          }
        } else if (entry.isFile() && entry.name.endsWith(".html")) {
          slug = entry.name.replace(/\.html$/, "");
          try {
            const stat = await fs.stat(path.join(sitesDir, entry.name));
            updatedAt = stat.mtime.toISOString();
          } catch {
            // Stat failed
          }
        }

        if (slug && !sitesMap.has(slug)) {
          sitesMap.set(slug, {
            slug,
            url: `${baseUrl}/${slug}/`,
            subpathUrl: `${baseUrl}/sites/${slug}/`,
            updatedAt,
            source: "local",
          });
        }
      }
    } catch {
      // Local sites directory doesn't exist or is empty
    }

    const sites = Array.from(sitesMap.values()).sort((a, b) =>
      a.slug.localeCompare(b.slug)
    );

    return NextResponse.json({
      success: true,
      count: sites.length,
      sites,
      deployMode: process.env.DEPLOY_MODE || "github",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
