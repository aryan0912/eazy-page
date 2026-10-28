"use client";

import React, { useState, useEffect, useCallback, useTransition } from "react";

interface SiteItem {
  slug: string;
  url: string;
  subpathUrl: string;
  updatedAt?: string;
  source: "github" | "local";
}

export default function AdminPage() {
  const [slug, setSlug] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [passkey, setPasskey] = useState("");
  const [showPasskey, setShowPasskey] = useState(false);
  const [rememberPasskey, setRememberPasskey] = useState(true);
  const [deployMode, setDeployMode] = useState<"github" | "vercel_direct">("github");

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);

  // Submit and status states
  const [isPending, startTransition] = useTransition();
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{
    url: string;
    subpathUrl?: string;
    slug: string;
    mode: string;
    message?: string;
  } | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // Published sites list
  const [sites, setSites] = useState<SiteItem[]>([]);
  const [loadingSites, setLoadingSites] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [origin, setOrigin] = useState("");

  // Load saved passkey from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
      const savedPasskey = localStorage.getItem("eazy_admin_passkey");
      if (savedPasskey) {
        setPasskey(savedPasskey);
      }
    }
  }, []);

  // Fetch list of published pages
  const fetchSites = useCallback(async (currentPasskey?: string) => {
    setLoadingSites(true);
    try {
      const activeKey = currentPasskey !== undefined ? currentPasskey : passkey;
      const res = await fetch("/api/list", {
        headers: activeKey ? { "x-admin-passkey": activeKey } : {},
      });
      if (res.ok) {
        const data = await res.json();
        if (data.sites) {
          setSites(data.sites);
        }
        if (data.deployMode) {
          setDeployMode(data.deployMode);
        }
      }
    } catch (err) {
      console.error("Failed to load published sites:", err);
    } finally {
      setLoadingSites(false);
    }
  }, [passkey]);

  useEffect(() => {
    fetchSites();
  }, [fetchSites]);

  // Handle slug formatting helper
  const handleSlugChange = (val: string) => {
    // Convert spaces to hyphens and allow only valid characters
    const sanitized = val
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-_]/g, "");
    setSlug(sanitized);
    setError(null);
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const validateAndSetFile = (selectedFile: File) => {
    const name = selectedFile.name.toLowerCase();
    if (!name.endsWith(".html") && !name.endsWith(".htm")) {
      setError("Only .html or .htm files are supported.");
      return;
    }
    setError(null);
    setFile(selectedFile);

    // Auto-suggest slug if empty and filename isn't index.html
    if (!slug) {
      const base = name.replace(/\.(html|htm)$/, "");
      if (base !== "index" && /^[a-z0-9-_]+$/.test(base)) {
        setSlug(base);
      }
    }
  };

  // Copy to clipboard helper
  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => {
      setCopiedUrl((prev) => (prev === url ? null : prev));
    }, 2000);
  };

  // Submit Handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessData(null);

    if (!slug) {
      setError("Please specify a URL slug.");
      return;
    }
    if (!file) {
      setError("Please upload an HTML file.");
      return;
    }

    if (rememberPasskey) {
      localStorage.setItem("eazy_admin_passkey", passkey);
    } else {
      localStorage.removeItem("eazy_admin_passkey");
    }

    startTransition(async () => {
      setStatusMessage("Uploading and publishing site...");
      try {
        const formData = new FormData();
        formData.append("slug", slug);
        formData.append("file", file);
        formData.append("mode", deployMode);
        if (passkey) {
          formData.append("passkey", passkey);
        }

        const res = await fetch("/api/upload", {
          method: "POST",
          headers: passkey ? { "x-admin-passkey": passkey } : {},
          body: formData,
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
          throw new Error(data.error || "Failed to publish page.");
        }

        setSuccessData({
          url: data.url,
          subpathUrl: data.subpathUrl,
          slug: data.slug,
          mode: data.mode,
          message: data.message,
        });

        // Refresh sites list
        fetchSites(passkey);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Upload failed.";
        setError(msg);
      } finally {
        setStatusMessage("");
      }
    });
  };

  const previewBase = origin || "https://yourdomain.com";
  const previewCleanUrl = `${previewBase}/${slug || "<slug>"}/`;

  const filteredSites = sites.filter((s) =>
    s.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-sky-400 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                EazyPage Portal
              </span>
              <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                Self-Hosted Publisher
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-3 text-xs">
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700/60">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-slate-300 font-mono">
                {deployMode === "github" ? "GitHub Sync" : "Vercel Direct"}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex-1 w-full space-y-10">
        {/* Intro Banner */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950/30 to-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 relative overflow-hidden shadow-xl">
          <div className="max-w-2xl relative z-10">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-2">
              Instant Static HTML Publisher
            </h1>
            <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
              Deploy standalone HTML marketing pages, promo funnels, or event sites
              under clean subpaths without touching Git commands or creating new repositories.
            </p>
          </div>
          <div className="absolute -right-8 -bottom-8 w-64 h-64 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
        </div>

        {/* Upload Form Card */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Slug Input */}
              <div className="space-y-2">
                <label
                  htmlFor="slug-input"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-300"
                >
                  Page Slug (URL Path)
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500 font-mono text-sm select-none">
                    /
                  </span>
                  <input
                    id="slug-input"
                    type="text"
                    required
                    value={slug}
                    onChange={(e) => handleSlugChange(e.target.value)}
                    placeholder="e.g. promo-offer-2026"
                    className="w-full pl-8 pr-4 py-2.5 bg-slate-950/80 border border-slate-700/80 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
                  />
                </div>
                <p className="text-xs text-slate-400">
                  Allowed: lowercase letters, numbers, hyphens, underscores.
                </p>
              </div>

              {/* Admin Passkey */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="passkey-input"
                    className="block text-xs font-semibold uppercase tracking-wider text-slate-300"
                  >
                    Admin Passkey
                  </label>
                  <label className="text-xs text-slate-400 flex items-center space-x-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rememberPasskey}
                      onChange={(e) => setRememberPasskey(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-950 text-indigo-500 focus:ring-0 text-xs"
                    />
                    <span>Remember</span>
                  </label>
                </div>
                <div className="relative">
                  <input
                    id="passkey-input"
                    type={showPasskey ? "text" : "password"}
                    value={passkey}
                    onChange={(e) => {
                      setPasskey(e.target.value);
                      setError(null);
                    }}
                    placeholder="Enter passkey if configured"
                    className="w-full pl-3.5 pr-10 py-2.5 bg-slate-950/80 border border-slate-700/80 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasskey(!showPasskey)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200"
                  >
                    {showPasskey ? (
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                    )}
                  </button>
                </div>
                <p className="text-xs text-slate-400">
                  Secures publication API against unauthorized uploads.
                </p>
              </div>
            </div>

            {/* Live URL Preview Pill */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center space-x-2 text-xs">
                <span className="text-slate-400 font-medium">Target URL:</span>
                <span className="font-mono text-indigo-400 break-all select-all">
                  {previewCleanUrl}
                </span>
              </div>
              <span className="text-[11px] text-slate-400">
                Rewrites to /sites/{slug || "<slug>"}/index.html
              </span>
            </div>

            {/* Dropzone File Upload */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                Static HTML File
              </label>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-200 cursor-pointer ${
                  isDragging
                    ? "border-indigo-400 bg-indigo-950/20"
                    : file
                    ? "border-emerald-500/50 bg-emerald-950/10"
                    : "border-slate-700/80 hover:border-slate-600 bg-slate-950/40"
                }`}
                onClick={() => {
                  const input = document.getElementById("file-upload-input");
                  input?.click();
                }}
              >
                <input
                  id="file-upload-input"
                  type="file"
                  accept=".html,.htm"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      validateAndSetFile(e.target.files[0]);
                    }
                  }}
                />

                {file ? (
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-white">
                        {file.name}
                      </p>
                      <p className="text-xs text-slate-400">
                        {(file.size / 1024).toFixed(1)} KB • Ready to publish
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                      }}
                      className="text-xs text-rose-400 hover:text-rose-300 ml-auto px-2.5 py-1 rounded bg-rose-500/10 border border-rose-500/20"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 mx-auto flex items-center justify-center">
                      <svg
                        className="w-6 h-6"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                        />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-200">
                        Drop your <span className="text-indigo-400">index.html</span> file here, or{" "}
                        <span className="text-indigo-400 underline underline-offset-2">
                          browse
                        </span>
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        Accepts .html or .htm files (up to 10MB)
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Error Banner */}
            {error && (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start space-x-3 text-rose-300 text-sm">
                <svg
                  className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>{error}</span>
              </div>
            )}

            {/* Action Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
              <div className="flex items-center space-x-2 text-xs text-slate-400">
                <span>Deploy Engine:</span>
                <select
                  value={deployMode}
                  onChange={(e) =>
                    setDeployMode(e.target.value as "github" | "vercel_direct")
                  }
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="github">GitHub-Backed Sync</option>
                  <option value="vercel_direct">Vercel Direct API</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={isPending || !slug || !file}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-sm text-white shadow-lg shadow-indigo-600/25 transition-all flex items-center justify-center space-x-2"
              >
                {isPending ? (
                  <>
                    <svg
                      className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    <span>{statusMessage || "Publishing..."}</span>
                  </>
                ) : (
                  <>
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span>Publish Static Page</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Success Banner */}
          {successData && (
            <div className="mt-8 p-6 rounded-2xl bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-950 border border-emerald-500/40 shadow-xl space-y-4">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-emerald-300">
                    Page Published Successfully!
                  </h3>
                  <p className="text-xs text-slate-300">
                    {successData.message || "Your page is ready."}
                  </p>
                </div>
              </div>

              {/* URL Display Box */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Live Public URL
                  </div>
                  <a
                    href={successData.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-mono text-indigo-400 hover:text-indigo-300 hover:underline break-all"
                  >
                    {successData.url}
                  </a>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => handleCopy(successData.url)}
                    className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 flex items-center space-x-1.5 transition-all"
                  >
                    {copiedUrl === successData.url ? (
                      <>
                        <svg
                          className="w-3.5 h-3.5 text-emerald-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        <span className="text-emerald-400 font-medium">Copied!</span>
                      </>
                    ) : (
                      <>
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                          />
                        </svg>
                        <span>Copy URL</span>
                      </>
                    )}
                  </button>

                  <a
                    href={successData.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-1.5 rounded-lg bg-indigo-600/80 hover:bg-indigo-600 text-xs text-white flex items-center space-x-1.5 transition-all"
                  >
                    <span>Open</span>
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Published Pages Dashboard */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center space-x-2">
                <span>Published Pages</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                  {sites.length}
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Pages managed by this portal
              </p>
            </div>

            <div className="flex items-center space-x-3">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Filter slugs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <svg
                  className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>

              <button
                type="button"
                onClick={() => fetchSites()}
                disabled={loadingSites}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-50 transition-all border border-slate-700"
                title="Refresh list"
              >
                <svg
                  className={`w-3.5 h-3.5 ${loadingSites ? "animate-spin" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* List/Table */}
          {filteredSites.length === 0 ? (
            <div className="p-8 text-center border border-slate-800/80 rounded-xl bg-slate-950/40 text-slate-500 text-xs">
              {loadingSites
                ? "Loading pages..."
                : searchQuery
                ? "No matching pages found."
                : "No static pages published yet. Use the form above to upload your first page!"}
            </div>
          ) : (
            <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40">
              {filteredSites.map((site) => (
                <div
                  key={site.slug}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-900/40 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-sm font-semibold text-white">
                        /{site.slug}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 font-mono">
                        {site.source}
                      </span>
                    </div>
                    <div className="text-xs font-mono text-indigo-400/80 break-all">
                      {site.url}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopy(site.url)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-xs text-slate-300 border border-slate-700/80 transition-all flex items-center space-x-1"
                    >
                      {copiedUrl === site.url ? (
                        <>
                          <svg
                            className="w-3 h-3 text-emerald-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <svg
                            className="w-3 h-3"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                            />
                          </svg>
                          <span>Copy</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSlug(site.slug);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-xs text-slate-300 border border-slate-700/80 transition-all"
                      title="Update this page"
                    >
                      Update
                    </button>

                    <a
                      href={site.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1.5 rounded-lg bg-indigo-600/80 hover:bg-indigo-600 text-xs text-white transition-all flex items-center space-x-1"
                    >
                      <span>Visit</span>
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                        />
                      </svg>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-6 text-center text-xs text-slate-500">
        <p>EazyPage Static Publisher • Self-Hosted on Next.js &amp; Vercel</p>
      </footer>
    </div>
  );
}
