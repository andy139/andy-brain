"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4001";

const SOURCE_FILTERS = [
  { key: "all", label: "All" },
  { key: "tiktok", label: "TikTok" },
  { key: "article", label: "Article" },
  { key: "note", label: "Note" },
  { key: "x", label: "X" },
  { key: "other", label: "Other" },
] as const;

const TYPE_LABEL: Record<string, string> = {
  tiktok: "TK",
  x: "X",
  article: "A",
  note: "N",
  other: "?",
};

const TYPE_COLOR: Record<string, string> = {
  tiktok: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  x: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  article: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  note: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  other: "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

type Entry = {
  id: string;
  content: string;
  source_url: string | null;
  source_type: string;
  tags: string[];
  notes: string | null;
  created_at: string;
};

export default function EntriesPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [keySet, setKeySet] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");

  const filteredEntries = useMemo(() => {
    let filtered = entries;
    if (sourceFilter !== "all") {
      filtered = filtered.filter((e) => e.source_type === sourceFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.content.toLowerCase().includes(q) ||
          e.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return filtered;
  }, [entries, searchQuery, sourceFilter]);

  function askAboutEntry(entry: Entry) {
    const topic =
      entry.tags.length > 0
        ? entry.tags[0]
        : entry.content.slice(0, 60).trim().replace(/\s+/g, " ");
    const q = `Summarize what I saved about ${topic}`;
    router.push(`/?q=${encodeURIComponent(q)}`);
  }

  const fetchEntries = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/entries?page=${p}&limit=20`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEntries(data.entries);
      setTotal(data.total);
      setPages(data.pages);
      setPage(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load entries");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries(1);
  }, [fetchEntries]);

  async function handleDelete(id: string) {
    if (!apiKey) return;
    setDeletingId(id);
    try {
      const res = await fetch(`${API_URL}/api/entries/${id}`, {
        method: "DELETE",
        headers: { "x-api-key": apiKey },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setEntries((prev) => prev.filter((e) => e.id !== id));
      setTotal((t) => t - 1);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="min-h-full">
      <div className="max-w-3xl mx-auto px-3 sm:px-4 py-6 sm:py-10">
        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-200 transition-colors mb-8 group"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:-translate-x-0.5 transition-transform">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Back to chat
        </Link>

        <div className="flex items-center justify-between mb-6 gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-gradient">Knowledge base</h1>
            {!loading && <p className="text-sm text-gray-500 mt-1">{total} entries</p>}
          </div>
          <Link
            href="/add"
            className="text-sm px-4 py-2 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/20 text-indigo-300 hover:text-indigo-200 transition-all duration-200"
          >
            + Add
          </Link>
        </div>

        {/* Search & filters */}
        <div className="mb-6 space-y-3">
          <div className="relative">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search entries by content or tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none input-glow transition-all"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SOURCE_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setSourceFilter(f.key)}
                className={`px-3 py-1.5 text-xs rounded-lg border transition-all duration-200 ${
                  sourceFilter === f.key
                    ? "bg-indigo-600/20 border-indigo-500/30 text-indigo-300"
                    : "bg-white/[0.03] border-white/[0.06] text-gray-400 hover:text-gray-200 hover:border-white/[0.12]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* API key for deletes */}
        {!keySet ? (
          <div className="mb-6 p-4 rounded-xl border border-white/[0.06] bg-white/[0.03]">
            <p className="text-sm text-gray-400 mb-3">Enter your API key to enable deletion</p>
            <div className="flex gap-2">
              <input
                type="password"
                placeholder="API key"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && apiKeyInput) {
                    setApiKey(apiKeyInput);
                    setKeySet(true);
                  }
                }}
                className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none input-glow"
              />
              <button
                onClick={() => { setApiKey(apiKeyInput); setKeySet(true); }}
                disabled={!apiKeyInput}
                className="px-4 py-2 text-sm rounded-lg bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 disabled:opacity-30 text-white transition-all shadow-lg shadow-indigo-500/10"
              >
                Set
              </button>
            </div>
          </div>
        ) : (
          <div className="mb-6 flex items-center justify-between text-sm px-1">
            <span className="text-gray-500">API key set — delete enabled</span>
            <button onClick={() => { setApiKey(""); setKeySet(false); setApiKeyInput(""); }} className="text-gray-600 hover:text-gray-400 transition-colors">
              Clear
            </button>
          </div>
        )}

        {/* Content */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="flex gap-1.5">
              <span className="w-2 h-2 bg-indigo-500/50 rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-2 h-2 bg-indigo-500/50 rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-2 h-2 bg-indigo-500/50 rounded-full animate-bounce [animation-delay:300ms]" />
            </div>
            <p className="text-sm text-gray-600">Loading entries...</p>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 text-sm">{error}</div>
        )}

        {!loading && !error && entries.length === 0 && !searchQuery && sourceFilter === "all" && (
          <div className="text-center py-20">
            <div className="w-12 h-12 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
            <p className="text-sm text-gray-500">No entries yet</p>
            <p className="text-xs text-gray-600 mt-1">Add your first piece of knowledge to get started</p>
          </div>
        )}

        {!loading && !error && entries.length > 0 && filteredEntries.length === 0 && (
          <div className="text-center py-16">
            <p className="text-sm text-gray-500">No entries match your search</p>
            <button
              onClick={() => { setSearchQuery(""); setSourceFilter("all"); }}
              className="text-xs text-indigo-400 hover:text-indigo-300 mt-2 transition-colors"
            >
              Clear filters
            </button>
          </div>
        )}

        {!loading && !error && filteredEntries.length > 0 && (
          <div className="space-y-3">
            {filteredEntries.map((entry, idx) => {
              const icon = TYPE_LABEL[entry.source_type] ?? "?";
              const color = TYPE_COLOR[entry.source_type] ?? TYPE_COLOR.other;
              const isExpanded = expandedId === entry.id;
              const isLong = entry.content.length > 220;
              const date = new Date(entry.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

              return (
                <div
                  key={entry.id}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3.5 sm:p-4 overflow-hidden card-glow animate-fade-in-up"
                  style={{ animationDelay: `${idx * 30}ms`, animationFillMode: "both" }}
                >
                  <div className="flex items-start gap-2.5 sm:gap-3">
                    <span className={`shrink-0 flex items-center justify-center w-8 h-8 rounded-lg border text-xs font-bold ${color}`}>
                      {icon}
                    </span>

                    <div className="min-w-0 flex-1">
                      {entry.source_url ? (
                        <a href={entry.source_url} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-gray-400 hover:text-indigo-400 transition-colors mb-1">
                          {entry.source_url}
                        </a>
                      ) : (
                        <span className="block text-xs text-gray-500 mb-1 capitalize">{entry.source_type}</span>
                      )}

                      <p className={`text-sm text-gray-300 leading-relaxed whitespace-pre-wrap ${isExpanded ? "" : "line-clamp-3"}`}>
                        {isExpanded ? entry.content : entry.content.slice(0, 220).trim()}{!isExpanded && isLong ? "..." : ""}
                      </p>

                      <div className="flex items-center gap-3 mt-2.5 flex-wrap">
                        {isLong && (
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                          >
                            {isExpanded ? "Show less" : "Read full entry"}
                          </button>
                        )}
                        {entry.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {entry.tags.map((tag) => (
                              <span key={tag} className="px-1.5 py-0.5 rounded-md text-xs bg-white/[0.05] text-gray-400 border border-white/[0.06]">{tag}</span>
                            ))}
                          </div>
                        )}
                        <span className="text-xs text-gray-600 ml-auto">{date}</span>
                      </div>

                      {isExpanded && entry.notes && (
                        <div className="mt-3 pt-3 border-t border-white/[0.06]">
                          <p className="text-xs text-gray-500 mb-1">Notes</p>
                          <p className="text-sm text-gray-400 whitespace-pre-wrap">{entry.notes}</p>
                        </div>
                      )}
                    </div>

                    <div className="shrink-0 flex flex-col gap-1">
                      <button
                        onClick={() => askAboutEntry(entry)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-600 hover:text-indigo-400 hover:bg-indigo-500/10 transition-all"
                        title="Ask about this"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                      </button>
                      {keySet && (
                        <button
                          onClick={() => handleDelete(entry.id)}
                          disabled={deletingId === entry.id}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-xs text-gray-600 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-40 transition-all"
                          title="Delete"
                        >
                          {deletingId === entry.id ? "..." : "\u2715"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-8">
            <button
              onClick={() => fetchEntries(page - 1)}
              disabled={page === 1 || loading}
              className="px-4 py-2 text-sm rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.06] disabled:opacity-30 text-gray-300 transition-all"
            >
              Prev
            </button>
            <span className="text-sm text-gray-500 tabular-nums">{page} / {pages}</span>
            <button
              onClick={() => fetchEntries(page + 1)}
              disabled={page === pages || loading}
              className="px-4 py-2 text-sm rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.06] disabled:opacity-30 text-gray-300 transition-all"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
