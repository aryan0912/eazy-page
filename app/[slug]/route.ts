import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const RESERVED_SLUGS = new Set([
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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;

  if (!slug || RESERVED_SLUGS.has(slug.toLowerCase())) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-_]/g, "");
  const filePath = path.join(
    process.cwd(),
    "public",
    "sites",
    cleanSlug,
    "index.html"
  );

  try {
    const htmlContent = await fs.readFile(filePath, "utf-8");
    return new NextResponse(htmlContent, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=0, must-revalidate",
      },
    });
  } catch {
    return new NextResponse("Site Not Found", { status: 404 });
  }
}
