"use client";

import { useState } from "react";

export type Source = {
  id: string;
  source_type: string;
  source_url: string | null;
  preview: string;
  tags: string[];
};

const TYPE_ICON: Record<string, string> = {
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

export default function SourceCard({ source }: { source: Source }) {
  const [expanded, setExpanded] = useState(false);
  const icon = TYPE_ICON[source.source_type] ?? "?";
  const colorClass = TYPE_COLOR[source.source_type] ?? TYPE_COLOR.other;

  const displayUrl = source.source_url
    ? source.source_url.replace(/^https?:\/\/(?:www\.)?/, "").slice(0, 50)
    : null;

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/50 text-sm overflow-hidden">
      {/* Compact header row — always visible */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-gray-800/50 transition-colors"
      >
        {/* Type badge */}
        <span
          className={`shrink-0 flex items-center justify-center w-6 h-6 rounded border text-[10px] font-bold ${colorClass}`}
        >
          {icon}
        </span>

        {/* URL or type label */}
        <span className="min-w-0 flex-1 truncate text-xs text-gray-400">
          {displayUrl ?? (
            <span className="capitalize">{source.source_type}</span>
          )}
        </span>

        {/* Expand chevron */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 text-gray-600 transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-gray-800/50 space-y-2">
          {/* Full URL link */}
          {source.source_url && (
            <a
              href={source.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              {source.source_url}
            </a>
          )}

          {/* Preview text */}
          <p className="text-xs text-gray-300 leading-relaxed">{source.preview}</p>

          {/* Tags */}
          {source.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {source.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-1.5 py-0.5 rounded text-[10px] bg-gray-800 text-gray-400"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
