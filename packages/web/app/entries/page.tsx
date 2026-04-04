"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4001";

const TYPE_LABEL: Record<string, string> = {
  tiktok: "TK",
  x: "X",
  article: "A",
  note: "N",
  other: "?",
};

const TYPE_COLOR: Record<string, string> = {
  tiktok: "bg-pink-900/50 text-pink-300 border-pink-800",
  x: "bg-sky-900/50 text-sky-300 border-sky-800",
  article: "bg-violet-900/50 text-violet-300 border-violet-800",
  note: "bg-amber-900/50 text-amber-300 border-amber-800",
  other: "bg-gray-800/50 text-gray-300 border-gray-700",
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
    <div className="min-h-full bg-gray-950">
      <div className="max-w-3xl mx-auto px-4 py-10">
        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors mb-8"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Back to chat
        </Link>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-white">Knowledge base</h1>
            {!loading && <p className="text-sm text-gray-500 mt-1">{total} entries</p>}
          </div>
          <Link
            href="/add"
            className="text-sm px-3 py-1.5 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-200 transition-colors"
          >
            + Add
          </Link>
        </div>

        {/* API key for deletes */}
        {!keySet ? (
          <div className="mb-6 p-4 rounded-lg border border-gray-800 bg-gray-900/50">
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
                className="flex-1 bg-gray-800 border border-gray-700 rounded-md px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                onClick={() => { setApiKey(apiKeyInput); setKeySet(true); }}
                disabled={!apiKeyInput}
                className="px-3 py-1.5 text-sm rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white transition-colors"
              >
                Set
              </button>
            </div>
          </div>
        ) : (
          <div className="mb-6 flex items-center justify-between text-sm">
            <span className="text-gray-500">API key set — delete enabled</span>
            <button onClick={() => { setApiKey(""); setKeySet(false); setApiKeyInput(""); }} className="text-gray-600 hover:text-gray-400 transition-colors">
              Clear
            </button>
          </div>
        )}

        {/* Content */}
        {loading && (
          <div className="flex justify-center py-16 text-gray-600 text-sm">Loading…</div>
        )}

        {error && (
          <div className="p-4 rounded-lg border border-red-900 bg-red-950/30 text-red-400 text-sm">{error}</div>
        )}

        {!loading && !error && entries.length === 0 && (
          <div className="text-center py-16 text-gray-600 text-sm">No entries yet.</div>
        )}

        {!loading && !error && entries.length > 0 && (
          <div className="space-y-3">
            {entries.map((entry) => {
              const icon = TYPE_LABEL[entry.source_type] ?? "?";
              const color = TYPE_COLOR[entry.source_type] ?? TYPE_COLOR.other;
              const isExpanded = expandedId === entry.id;
              const isLong = entry.content.length > 220;
              const date = new Date(entry.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

              return (
                <div key={entry.id} className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
                  <div className="flex items-start gap-3">
                    <span className={`shrink-0 flex items-center justify-center w-8 h-8 rounded-md border text-xs font-bold ${color}`}>
                      {icon}
                    </span>

                    <div className="min-w-0 flex-1">
                      {entry.source_url ? (
                        <a href={entry.source_url} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-gray-400 hover:text-gray-200 transition-colors mb-1">
                          {entry.source_url}
                        </a>
                      ) : (
                        <span className="block text-xs text-gray-500 mb-1 capitalize">{entry.source_type}</span>
                      )}

                      <p className={`text-sm text-gray-300 leading-relaxed whitespace-pre-wrap ${isExpanded ? "" : "line-clamp-3"}`}>
                        {isExpanded ? entry.content : entry.content.slice(0, 220).trim()}{!isExpanded && isLong ? "…" : ""}
                      </p>

                      <div className="flex items-center gap-3 mt-2 flex-wrap">
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
                              <span key={tag} className="px-1.5 py-0.5 rounded text-xs bg-gray-800 text-gray-400">{tag}</span>
                            ))}
                          </div>
                        )}
                        <span className="text-xs text-gray-600 ml-auto">{date}</span>
                      </div>

                      {isExpanded && entry.notes && (
                        <div className="mt-3 pt-3 border-t border-gray-800">
                          <p className="text-xs text-gray-500 mb-1">Notes</p>
                          <p className="text-sm text-gray-400 whitespace-pre-wrap">{entry.notes}</p>
                        </div>
                      )}
                    </div>

                    {keySet && (
                      <button
                        onClick={() => handleDelete(entry.id)}
                        disabled={deletingId === entry.id}
                        className="shrink-0 text-xs text-gray-600 hover:text-red-400 disabled:opacity-40 transition-colors px-1"
                        title="Delete"
                      >
                        {deletingId === entry.id ? "…" : "✕"}
                      </button>
                    )}
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
              className="px-3 py-1.5 text-sm rounded-md bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-300 transition-colors"
            >
              ← Prev
            </button>
            <span className="text-sm text-gray-500">{page} / {pages}</span>
            <button
              onClick={() => fetchEntries(page + 1)}
              disabled={page === pages || loading}
              className="px-3 py-1.5 text-sm rounded-md bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-300 transition-colors"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
