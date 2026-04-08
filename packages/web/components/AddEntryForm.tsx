"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type SourceType = "tiktok" | "x" | "article" | "note" | "other";
type Mode = "text" | "pdf";

const SOURCE_TYPES: { value: SourceType; label: string }[] = [
  { value: "article", label: "Article" },
  { value: "note", label: "Note" },
  { value: "x", label: "X / Twitter" },
  { value: "tiktok", label: "TikTok" },
  { value: "other", label: "Other" },
];

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function AddEntryForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("text");

  // Text fields
  const [content, setContent] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceType, setSourceType] = useState<SourceType>("note");

  // Shared fields
  const [tagsRaw, setTagsRaw] = useState("");
  const [notes, setNotes] = useState("");
  const [apiKey, setApiKey] = useState("");

  // PDF field
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [result, setResult] = useState<{ entry_id: string; chunks_created: number; filename?: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");
    setResult(null);

    const tags = tagsRaw.split(",").map((t) => t.trim()).filter(Boolean);

    try {
      let res: Response;

      if (mode === "pdf") {
        if (!pdfFile) throw new Error("Select a PDF file first");
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(",")[1]); // strip data:...;base64,
          };
          reader.onerror = reject;
          reader.readAsDataURL(pdfFile);
        });
        res = await fetch(`${API_URL}/api/ingest/pdf`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": apiKey },
          body: JSON.stringify({ data: base64, filename: pdfFile.name, tags, notes: notes.trim() || undefined }),
        });
      } else {
        if (!content.trim()) throw new Error("Content is required");
        res = await fetch(`${API_URL}/api/ingest`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": apiKey },
          body: JSON.stringify({
            content,
            source_url: sourceUrl.trim() || undefined,
            source_type: sourceType,
            tags,
            notes: notes.trim() || undefined,
          }),
        });
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      const data = await res.json();
      setResult(data);
      setStatus("success");
      setContent("");
      setSourceUrl("");
      setTagsRaw("");
      setNotes("");
      setPdfFile(null);
    } catch (err) {
      setErrorMsg((err as Error).message);
      setStatus("error");
    }
  };

  const canSubmit =
    apiKey.trim() &&
    status !== "loading" &&
    (mode === "pdf" ? !!pdfFile : !!content.trim());

  const inputClass = "w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none input-glow transition-all";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Mode toggle */}
      <div className="flex gap-2">
        {(["text", "pdf"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              mode === m
                ? "bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-lg shadow-indigo-500/20"
                : "bg-white/[0.06] border border-white/[0.06] text-gray-400 hover:text-gray-200 hover:bg-white/[0.1]"
            }`}
          >
            {m === "text" ? "Text / URL" : "PDF"}
          </button>
        ))}
      </div>

      {mode === "text" ? (
        <>
          {/* Content */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Content <span className="text-red-400">*</span>
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
              rows={8}
              placeholder="Paste article text, a note, a tweet, or any content you want to save..."
              className={`${inputClass} resize-y`}
            />
          </div>

          {/* Source type */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Source type</label>
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value as SourceType)}
              className={inputClass}
            >
              {SOURCE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Source URL */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Source URL
              {sourceType === "article" && (
                <span className="ml-2 text-xs text-indigo-400">
                  (article text will be auto-extracted from this URL)
                </span>
              )}
            </label>
            <input
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://..."
              className={inputClass}
            />
          </div>
        </>
      ) : (
        /* PDF upload */
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            PDF file <span className="text-red-400">*</span>
          </label>
          <div
            className={`relative rounded-xl border-2 border-dashed px-6 py-12 text-center transition-all duration-200 ${
              pdfFile
                ? "border-indigo-500/40 bg-indigo-500/[0.05]"
                : "border-white/[0.1] hover:border-white/[0.2] hover:bg-white/[0.02]"
            }`}
          >
            <input
              type="file"
              accept=".pdf,application/pdf"
              onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            {pdfFile ? (
              <div className="text-sm text-indigo-300">
                <span className="font-medium">{pdfFile.name}</span>
                <span className="ml-2 text-gray-500">({(pdfFile.size / 1024).toFixed(0)} KB)</span>
              </div>
            ) : (
              <div className="text-sm text-gray-500">
                Drop a PDF here or <span className="text-indigo-400">click to browse</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tags */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Tags <span className="text-gray-500 font-normal">comma-separated</span>
        </label>
        <input
          type="text"
          value={tagsRaw}
          onChange={(e) => setTagsRaw(e.target.value)}
          placeholder="ai, productivity, health"
          className={inputClass}
        />
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Personal notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Why are you saving this? What's interesting about it?"
          className={`${inputClass} resize-y`}
        />
      </div>

      {/* API key */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          API key <span className="text-gray-500 font-normal">your AUTH_TOKEN</span>
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          required
          placeholder="••••••••"
          className={inputClass}
        />
      </div>

      {/* Status messages */}
      {status === "success" && result && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300 animate-fade-in">
          {result.filename ? `"${result.filename}" saved! ` : "Saved! "}
          {result.chunks_created} chunk{result.chunks_created !== 1 ? "s" : ""} indexed.{" "}
          <button type="button" onClick={() => router.push("/")} className="underline hover:no-underline">
            Go to chat
          </button>
        </div>
      )}

      {status === "error" && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300 animate-fade-in">
          {errorMsg}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 disabled:opacity-30 disabled:cursor-not-allowed px-4 py-3.5 text-sm font-medium text-white transition-all shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 disabled:shadow-none"
      >
        {status === "loading" ? "Saving..." : mode === "pdf" ? "Upload PDF" : "Save to knowledge base"}
      </button>
    </form>
  );
}
