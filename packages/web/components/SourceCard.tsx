"use client";

import { useState } from "react";

export type Source = {
  id: string;
  source_type: string;
  source_url: string | null;
  preview?: string;
  title?: string;
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
  tiktok: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  x: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  article: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  note: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  other: "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

export default function SourceCard({ source }: { source: Source }) {
  const [expanded, setExpanded] = useState(false);
  const icon = TYPE_ICON[source.source_type] ?? "?";
  const colorClass = TYPE_COLOR[source.source_type] ?? TYPE_COLOR.other;

  const displayUrl = source.source_url
    ? source.source_url.replace(/^https?:\/\/(?:www\.)?/, "").slice(0, 50)
    : null;

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] text-sm overflow-hidden card-glow">
      {/* Compact header row — always visible */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex items-center gap-2.5 w-full px-3 py-2.5 text-left hover:bg-white/[0.03] transition-colors"
      >
        {/* Type badge */}
        <span
          className={`shrink-0 flex items-center justify-center w-6 h-6 rounded-md border text-[10px] font-bold ${colorClass}`}
        >
          {icon}
        </span>

        {/* Title or URL */}
        <span className="min-w-0 flex-1 truncate text-xs text-gray-300">
          {source.title ?? displayUrl ?? (
            <span className="capitalize text-gray-400">{source.source_type}</span>
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
          className={`shrink-0 text-gray-600 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-white/[0.04] space-y-2 animate-slide-up">
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
                  className="px-1.5 py-0.5 rounded-md text-[10px] bg-white/[0.05] text-gray-400 border border-white/[0.06]"
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
