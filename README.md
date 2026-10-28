# EazyPage: Self-Hosted Static HTML Hosting Portal on Vercel

A modern Next.js (App Router) portal deployed on Vercel that allows non-technical administrators to upload and host standalone static HTML pages (e.g., promo landers, event pages, marketing funnels) under clean subpaths (`https://yourdomain.com/<slug>/`) without touching Git or creating new repositories.

---

## Architecture Overview

```
                   ┌────────────────────────────────────────┐
                   │           Admin Web Portal             │
                   │     (app/page.tsx - Tailwind CSS)      │
                   └──────────────────┬─────────────────────┘
                                      │ POST /api/upload
                                      ▼
                   ┌────────────────────────────────────────┐
                   │         Next.js Backend API            │
                   │      (app/api/upload/route.ts)         │
                   └──────┬──────────────────────────┬──────┘
                          │                          │
        [DEPLOY_MODE="github"]            [DEPLOY_MODE="vercel_direct"]
                          │                          │
                          ▼                          ▼
               GitHub Contents API            Vercel REST API
           `public/sites/<slug>/index.html`   `POST /v13/deployments`
                          │                          │
                          ▼                          ▼
                 Vercel Auto-Deploy           Instant Live URL
                          │                          │
                          └───────────┬──────────────┘
                                      ▼
                   ┌────────────────────────────────────────┐
                   │              Public Visitor            │
                   │       https://yourdomain.com/<slug>/   │
                   │  (rewritten to /sites/<slug>/index.html)
                   └────────────────────────────────────────┘
```

---

## Features

- **Zero-Git for Admins:** Drop an `index.html` file, provide a slug (e.g. `diwali-sale-2026`), and receive a live URL instantly.
- **Clean Subpaths:** Static pages are served at `https://yourdomain.com/<slug>/` via Next.js URL rewrites.
- **Dual Deployment Modes:**
  - **`github` (Default, Persistent):** Commits the static page directly to the repository via GitHub's Contents API under `public/sites/<slug>/index.html`. Vercel detects the commit to `main` and automatically redeploys.
  - **`vercel_direct` (Instant):** Creates a deployment immediately using Vercel's REST API (`POST /v13/deployments`) without waiting on a Git commit.
- **Admin Passkey Authentication:** Protects upload and listing endpoints against unauthorized uploads.
- **Published Pages Dashboard:** Live table listing all published pages with one-click copy and visit actions.
- **Local Development Fallback:** When running locally without cloud tokens, saves files directly into `public/sites/` for instant preview.

---

## Project Structure

```text
eazy-page/
├── app/
│   ├── api/
│   │   ├── upload/
│   │   │   └── route.ts       # Handles auth, validation, and push to GitHub/Vercel
│   │   └── list/
│   │       └── route.ts       # Lists all published pages (for admin dashboard)
│   ├── globals.css            # Tailwind CSS styles
│   ├── layout.tsx             # Root layout
│   └── page.tsx               # Admin UI dashboard
├── public/
│   └── sites/                 # Hosted static sites live here
│       └── .gitkeep
├── .env.example               # Template environment configuration
├── next.config.ts             # Clean URL rewrite rules
├── package.json
└── README.md
```

---

## Setup & Environment Variables

Create a `.env.local` file (or set these in your Vercel Project Settings > Environment Variables):

```bash
# Admin Passkey (protects API & UI)
ADMIN_PASSKEY="your-secret-passkey"

# Deployment Mode: "github" (recommended) or "vercel_direct"
DEPLOY_MODE="github"

# Optional: Custom domain or base URL
# NEXT_PUBLIC_BASE_URL="https://pages.yourdomain.com"
```

### For GitHub-Backed Mode (`DEPLOY_MODE="github"`)

1. Generate a **GitHub Personal Access Token (Classic or Fine-grained)** with `repo` or `Contents: Read and Write` permissions.
2. Configure the following variables:
   ```bash
   GITHUB_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
   GITHUB_REPO="your-username-or-org/eazy-page"
   GITHUB_BRANCH="main"
   ```

### For Direct Vercel Mode (`DEPLOY_MODE="vercel_direct"`)

1. Generate a **Vercel API Token** in your Vercel Account Settings under **Tokens**.
2. Configure:
   ```bash
   VERCEL_TOKEN="xxxxxxxxxxxxxxxxxxxxxxxx"
   VERCEL_PROJECT_NAME="sites-hub"
   # VERCEL_TEAM_ID="team_xxxxxxxxxxxx" # Optional (if using a team)
   ```

---

## Running Locally

```bash
# 1. Install dependencies
pnpm install

# 2. Start development server
pnpm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to open the Admin Portal.

---

## Deployment to Vercel

1. Push this repository to GitHub.
2. In the [Vercel Dashboard](https://vercel.com/new), import the repository.
3. Add the environment variables (`ADMIN_PASSKEY`, `GITHUB_TOKEN`, `GITHUB_REPO`, `GITHUB_BRANCH`, `DEPLOY_MODE`).
4. Click **Deploy**.

---

## API Reference

### 1. `POST /api/upload`
Uploads and publishes a static HTML page.

**Headers:**
- `x-admin-passkey`: `string` (if not passed in form data)

**Body (`multipart/form-data`):**
- `slug`: `string` (lowercase alphanumeric and hyphens, e.g. `promo-offer`)
- `file`: `File` (`.html` or `.htm` file, up to 10MB)
- `passkey`: `string` (admin passkey)
- `mode`: `"github"` | `"vercel_direct"` (optional override)

**Response:**
```json
{
  "success": true,
  "slug": "promo-offer",
  "url": "https://yourdomain.com/promo-offer/",
  "subpathUrl": "https://yourdomain.com/sites/promo-offer/",
  "mode": "github",
  "commitSha": "e45a1c8f...",
  "message": "Successfully committed to GitHub! Vercel will trigger a build and redeploy automatically."
}
```

### 2. `GET /api/list`
Lists all published pages.

**Headers:**
- `x-admin-passkey`: `string` (optional if passkey configured)

**Response:**
```json
{
  "success": true,
  "count": 1,
  "sites": [
    {
      "slug": "promo-offer",
      "url": "https://yourdomain.com/promo-offer/",
      "subpathUrl": "https://yourdomain.com/sites/promo-offer/",
      "source": "github"
    }
  ],
  "deployMode": "github"
}
```
