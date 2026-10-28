import { promises as fs } from "fs";
import path from "path";

export const RESERVED_SLUGS = new Set([
  "api",
  "sites",
  "public",
  "_next",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "admin",
  "login",
  "static",
]);

/**
 * Cache directory in writable /tmp (available in serverless environments)
 */
function getTmpSitePath(slug: string): string {
  return path.join("/tmp", "sites", slug, "index.html");
}

function getLocalSitePath(slug: string): string {
  return path.join(process.cwd(), "public", "sites", slug, "index.html");
}

/**
 * Saves HTML to local filesystem and /tmp for immediate warm-lambda availability
 */
export async function cacheSiteLocally(slug: string, content: Buffer | string): Promise<void> {
  const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-_]/g, "");

  // 1. Try writing to public/sites (local dev or build)
  try {
    const localDir = path.join(process.cwd(), "public", "sites", cleanSlug);
    await fs.mkdir(localDir, { recursive: true });
    await fs.writeFile(path.join(localDir, "index.html"), content);
  } catch {
    // Read-only filesystem in production serverless
  }

  // 2. Try writing to /tmp (writable in Vercel Lambdas)
  try {
    const tmpDir = path.join("/tmp", "sites", cleanSlug);
    await fs.mkdir(tmpDir, { recursive: true });
    await fs.writeFile(path.join(tmpDir, "index.html"), content);
  } catch {
    // Non-fatal
  }
}

/**
 * Retrieves the HTML content for a slug.
 * Checks build-time public folder, /tmp cache, and falls back to GitHub Contents API.
 */
export async function getSiteHtml(slug: string): Promise<string | null> {
  const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-_]/g, "");
  if (!cleanSlug || RESERVED_SLUGS.has(cleanSlug)) {
    return null;
  }

  // 1. Check bundled public/sites/<slug>/index.html
  try {
    const localPath = getLocalSitePath(cleanSlug);
    return await fs.readFile(localPath, "utf-8");
  } catch {
    // Not found locally
  }

  // 2. Check /tmp/sites/<slug>/index.html
  try {
    const tmpPath = getTmpSitePath(cleanSlug);
    return await fs.readFile(tmpPath, "utf-8");
  } catch {
    // Not found in /tmp
  }

  // 3. Dynamic GitHub fetch (guarantees instant availability for newly uploaded sites)
  const githubToken = process.env.GITHUB_TOKEN;
  const githubRepo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || "main";

  if (githubToken && githubRepo) {
    try {
      const ghUrl = `https://api.github.com/repos/${githubRepo}/contents/public/sites/${cleanSlug}/index.html?ref=${branch}`;
      const res = await fetch(ghUrl, {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github.raw+json",
          "User-Agent": "EazyPage-Publisher",
        },
        // Cache in Next.js Data Cache for 60s
        next: { revalidate: 60 },
      });

      if (res.ok) {
        const html = await res.text();
        // Persist to /tmp for subsequent ultra-fast hits
        cacheSiteLocally(cleanSlug, html).catch(() => {});
        return html;
      }
    } catch (err) {
      console.error(`Error fetching slug '${cleanSlug}' from GitHub:`, err);
    }
  }

  return null;
}
