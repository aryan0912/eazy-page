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

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const passkey =
      (formData.get("passkey") as string) ||
      request.headers.get("x-admin-passkey") ||
      "";
    const rawSlug = (formData.get("slug") as string) || "";
    const file = formData.get("file") as File | null;
    const requestedMode = (formData.get("mode") as string) || "";

    // 1. Validate Admin Passkey
    const expectedPasskey = process.env.ADMIN_PASSKEY;
    if (expectedPasskey) {
      if (!passkey || passkey !== expectedPasskey) {
        return NextResponse.json(
          { success: false, error: "Unauthorized: Invalid or missing passkey." },
          { status: 401 }
        );
      }
    }

    // 2. Validate and sanitize slug
    const slug = rawSlug.trim().toLowerCase();
    if (!slug) {
      return NextResponse.json(
        { success: false, error: "Validation Error: Slug is required." },
        { status: 400 }
      );
    }

    if (!/^[a-z0-9-_]+$/.test(slug)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Validation Error: Slug may only contain lowercase letters, numbers, hyphens, and underscores.",
        },
        { status: 400 }
      );
    }

    if (RESERVED_SLUGS.has(slug)) {
      return NextResponse.json(
        {
          success: false,
          error: `Validation Error: The slug '${slug}' is a reserved keyword. Please choose another name.`,
        },
        { status: 400 }
      );
    }

    // 3. Validate File
    if (!file) {
      return NextResponse.json(
        { success: false, error: "Validation Error: File is required." },
        { status: 400 }
      );
    }

    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith(".html") && !fileName.endsWith(".htm")) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation Error: Only .html or .htm files are supported.",
        },
        { status: 400 }
      );
    }

    // 10MB file limit
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { success: false, error: "Validation Error: File exceeds 10MB limit." },
        { status: 400 }
      );
    }

    const fileBytes = await file.arrayBuffer();
    const buffer = Buffer.from(fileBytes);
    const base64Content = buffer.toString("base64");

    const mode = (
      requestedMode ||
      process.env.DEPLOY_MODE ||
      "github"
    ).toLowerCase();
    const baseUrl = getBaseUrl(request);
    const targetUrl = `${baseUrl}/${slug}/`;
    const subpathUrl = `${baseUrl}/sites/${slug}/`;

    // Attempt local file write (for immediate preview / DX / local dev fallback)
    let localSaved = false;
    try {
      const siteDir = path.join(process.cwd(), "public", "sites", slug);
      await fs.mkdir(siteDir, { recursive: true });
      await fs.writeFile(path.join(siteDir, "index.html"), buffer);
      localSaved = true;
    } catch {
      // Non-fatal if filesystem is read-only in serverless environment
    }

    // 4. Handle GitHub-backed deployment mode
    if (mode === "github") {
      const githubToken = process.env.GITHUB_TOKEN;
      const githubRepo = process.env.GITHUB_REPO; // format: owner/repo
      const branch = process.env.GITHUB_BRANCH || "main";

      if (!githubToken || !githubRepo) {
        // If credentials are not configured, but local file was saved (e.g. running locally in dev)
        if (localSaved) {
          return NextResponse.json({
            success: true,
            url: targetUrl,
            subpathUrl,
            slug,
            mode: "github_local_preview",
            message:
              "Saved locally in public/sites/. Notice: GITHUB_TOKEN or GITHUB_REPO not set in .env. Configure them to push to GitHub.",
          });
        }

        return NextResponse.json(
          {
            success: false,
            error:
              "Configuration Error: GITHUB_TOKEN and GITHUB_REPO environment variables must be configured for GitHub deploy mode.",
          },
          { status: 500 }
        );
      }

      const filePath = `public/sites/${slug}/index.html`;
      const githubApiBase = `https://api.github.com/repos/${githubRepo}/contents/${filePath}`;

      // Check if file already exists to get its SHA for update
      let existingSha: string | undefined = undefined;
      try {
        const checkRes = await fetch(`${githubApiBase}?ref=${branch}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${githubToken}`,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "EazyPage-Publisher",
          },
        });
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          existingSha = checkData.sha;
        }
      } catch {
        // Ignore check failure, proceed to attempt create
      }

      // Commit file to GitHub repository
      const commitRes = await fetch(githubApiBase, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
          "User-Agent": "EazyPage-Publisher",
        },
        body: JSON.stringify({
          message: `feat(site): publish ${slug}`,
          content: base64Content,
          branch,
          ...(existingSha ? { sha: existingSha } : {}),
        }),
      });

      if (!commitRes.ok) {
        const errData = await commitRes.json().catch(() => ({}));
        return NextResponse.json(
          {
            success: false,
            error: `GitHub API error: ${errData.message || commitRes.statusText}`,
          },
          { status: commitRes.status }
        );
      }

      const commitData = await commitRes.json();

      return NextResponse.json({
        success: true,
        url: targetUrl,
        subpathUrl,
        slug,
        mode: "github",
        commitSha: commitData?.commit?.sha,
        message:
          "Successfully committed to GitHub! Vercel will trigger a build and redeploy automatically.",
      });
    }

    // 5. Handle Direct Vercel REST API mode
    if (mode === "vercel_direct") {
      const vercelToken = process.env.VERCEL_TOKEN;
      const projectName =
        process.env.VERCEL_PROJECT_NAME ||
        process.env.VERCEL_PROJECT_ID ||
        "sites-hub";
      const teamId = process.env.VERCEL_TEAM_ID;

      if (!vercelToken) {
        if (localSaved) {
          return NextResponse.json({
            success: true,
            url: targetUrl,
            subpathUrl,
            slug,
            mode: "vercel_local_preview",
            message:
              "Saved locally. Notice: VERCEL_TOKEN not set in .env. Configure VERCEL_TOKEN to use direct Vercel API deployment.",
          });
        }

        return NextResponse.json(
          {
            success: false,
            error:
              "Configuration Error: VERCEL_TOKEN is required for vercel_direct deployment mode.",
          },
          { status: 500 }
        );
      }

      const vercelApiUrl = new URL("https://api.vercel.com/v13/deployments");
      if (teamId) {
        vercelApiUrl.searchParams.set("teamId", teamId);
      }

      const deployRes = await fetch(vercelApiUrl.toString(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${vercelToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: projectName,
          project: projectName,
          files: [
            {
              file: `public/sites/${slug}/index.html`,
              data: base64Content,
              encoding: "base64",
            },
          ],
        }),
      });

      if (!deployRes.ok) {
        const errData = await deployRes.json().catch(() => ({}));
        return NextResponse.json(
          {
            success: false,
            error: `Vercel API Error: ${errData?.error?.message || deployRes.statusText}`,
          },
          { status: deployRes.status }
        );
      }

      const deployData = await deployRes.json();
      const directUrl = deployData?.url
        ? `https://${deployData.url}/sites/${slug}/`
        : targetUrl;

      return NextResponse.json({
        success: true,
        url: directUrl,
        cleanUrl: targetUrl,
        slug,
        mode: "vercel_direct",
        deploymentId: deployData?.id,
        readyState: deployData?.readyState,
        message: "Successfully deployed directly to Vercel!",
      });
    }

    return NextResponse.json(
      { success: false, error: `Invalid DEPLOY_MODE: '${mode}'` },
      { status: 400 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
