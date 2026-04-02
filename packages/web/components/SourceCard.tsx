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
  const icon = TYPE_ICON[source.source_type] ?? "?";
  const colorClass = TYPE_COLOR[source.source_type] ?? TYPE_COLOR.other;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-gray-800 bg-gray-900/50 p-3 text-sm">
      {/* Type badge */}
      <span
        className={`shrink-0 flex items-center justify-center w-8 h-8 rounded-md border text-xs font-bold ${colorClass}`}
      >
        {icon}
      </span>

      <div className="min-w-0 flex-1">
        {/* Source URL or type label */}
        {source.source_url ? (
          <a
            href={source.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate text-xs text-gray-400 hover:text-gray-200 transition-colors mb-1"
          >
            {source.source_url}
          </a>
        ) : (
          <span className="block text-xs text-gray-500 mb-1 capitalize">
            {source.source_type}
          </span>
        )}

        {/* Preview */}
        <p className="text-gray-300 line-clamp-2 leading-relaxed">{source.preview}</p>

        {/* Tags */}
        {source.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {source.tags.map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 rounded text-xs bg-gray-800 text-gray-400"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
