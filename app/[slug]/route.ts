import { NextRequest, NextResponse } from "next/server";
import { getSiteHtml, RESERVED_SLUGS } from "@/lib/sites";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;

  if (!slug || RESERVED_SLUGS.has(slug.toLowerCase())) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const htmlContent = await getSiteHtml(slug);

  if (!htmlContent) {
    return new NextResponse("Site Not Found", { status: 404 });
  }

  return new NextResponse(htmlContent, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=86400",
    },
  });
}
