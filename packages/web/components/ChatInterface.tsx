"use client";

import { useEffect, useRef, useState } from "react";
import SourceCard, { type Source } from "./SourceCard";

type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  followups?: string[];
  error?: boolean;
};

/**
 * Lightweight markdown-to-HTML renderer for assistant messages.
 * Handles: ## headers, **bold**, `inline code`, ```code blocks```, and - lists.
 * No external dependencies.
 */
function renderMarkdown(text: string): string {
  // Escape HTML entities first
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Fenced code blocks: ```...```
  html = html.replace(
    /```(?:\w*)\n([\s\S]*?)```/g,
    '<pre class="bg-black/40 border border-white/[0.06] rounded-lg px-4 py-3 my-2 overflow-x-auto text-xs leading-relaxed font-mono"><code>$1</code></pre>'
  );

  // Inline code: `...`
  html = html.replace(
    /`([^`\n]+)`/g,
    '<code class="bg-indigo-500/10 text-indigo-300 px-1.5 py-0.5 rounded text-xs font-mono border border-indigo-500/10">$1</code>'
  );

  // Headers: ## or ### at start of line
  html = html.replace(
    /^### (.+)$/gm,
    '<h3 class="text-sm font-semibold text-gray-100 mt-3 mb-1">$1</h3>'
  );
  html = html.replace(
    /^## (.+)$/gm,
    '<h2 class="text-base font-semibold text-white mt-4 mb-1">$1</h2>'
  );
  html = html.replace(
    /^# (.+)$/gm,
    '<h1 class="text-lg font-bold text-white mt-4 mb-1">$1</h1>'
  );

  // Bold: **text**
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Italic: *text* (but not inside **)
  html = html.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>");

  // Unordered list items: lines starting with - or *
  // Group consecutive list items into a <ul>
  html = html.replace(
    /((?:^[ \t]*[-*] .+\n?)+)/gm,
    (block) => {
      const items = block
        .trim()
        .split("\n")
        .map((line) =>
          `<li class="ml-4 list-disc text-gray-300">${line.replace(/^[ \t]*[-*] /, "")}</li>`
        )
        .join("");
      return `<ul class="my-1 space-y-0.5">${items}</ul>`;
    }
  );

  // Ordered list items: lines starting with 1. 2. etc.
  html = html.replace(
    /((?:^[ \t]*\d+\. .+\n?)+)/gm,
    (block) => {
      const items = block
        .trim()
        .split("\n")
        .map((line) =>
          `<li class="ml-4 list-decimal text-gray-300">${line.replace(/^[ \t]*\d+\. /, "")}</li>`
        )
        .join("");
      return `<ol class="my-1 space-y-0.5">${items}</ol>`;
    }
  );

  // Hyperlink URLs (but not inside <a> or <code> tags already)
  html = html.replace(
    /(?<!["'>])(https?:\/\/[^\s<)"]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition-colors">$1</a>'
  );

  // Convert remaining double newlines into paragraph breaks
  html = html.replace(/\n{2,}/g, '<div class="h-3"></div>');

  // Single newlines become <br>
  html = html.replace(/\n/g, "<br>");

  return html;
}

const SOURCES_SENTINEL = "__SOURCES__";
const FOLLOWUPS_SENTINEL = "__FOLLOWUPS__";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

const FALLBACK_SUGGESTIONS = [
  "What did I learn from my TikToks this week?",
  "Summarize the coding techniques I saved",
  "Any Claude Code tips in my brain?",
  "What automation tricks have I saved?",
  "Remind me about those testing strategies",
  "What open source tools did I bookmark?",
];

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>(FALLBACK_SUGGESTIONS);
  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch dynamic suggestions from the API on mount
  useEffect(() => {
    fetch(`${API_URL}/api/suggestions`)
      .then((r) => r.json())
      .then((d) => setSuggestions(d.suggestions ?? FALLBACK_SUGGESTIONS))
      .catch(() => setSuggestions(FALLBACK_SUGGESTIONS));
  }, []);

  // Auto-scroll on new content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (override?: string) => {
    const question = override ?? input.trim();
    if (!question || inFlightRef.current) return;
    inFlightRef.current = true;

    setInput("");
    setIsStreaming(true);

    let assistantIdx = -1;
    setMessages((prev) => {
      assistantIdx = prev.length + 1;
      return [
        ...prev,
        { role: "user", content: question },
        { role: "assistant", content: "", sources: [] },
      ];
    });

    abortRef.current = new AbortController();

    try {
      const res = await fetch(`${API_URL}/api/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const sentinelIdx = buffer.indexOf(SOURCES_SENTINEL);
        const displayText =
          sentinelIdx >= 0 ? buffer.slice(0, sentinelIdx) : buffer;

        setMessages((prev) => {
          if (assistantIdx < 0 || assistantIdx >= prev.length) return prev;
          const updated = [...prev];
          updated[assistantIdx] = { ...updated[assistantIdx], content: displayText };
          return updated;
        });
      }

      // Parse sources and follow-ups from sentinels
      const srcIdx = buffer.indexOf(SOURCES_SENTINEL);
      const fupIdx = buffer.indexOf(FOLLOWUPS_SENTINEL);
      if (srcIdx >= 0) {
        try {
          const srcEnd = fupIdx > srcIdx ? fupIdx : buffer.length;
          const sources: Source[] = JSON.parse(
            buffer.slice(srcIdx + SOURCES_SENTINEL.length, srcEnd).trim()
          );
          let followups: string[] = [];
          if (fupIdx >= 0) {
            try {
              followups = JSON.parse(buffer.slice(fupIdx + FOLLOWUPS_SENTINEL.length).trim());
            } catch { /* ignore */ }
          }
          setMessages((prev) => {
            if (assistantIdx < 0 || assistantIdx >= prev.length) return prev;
            const updated = [...prev];
            updated[assistantIdx] = { ...updated[assistantIdx], sources, followups };
            return updated;
          });
        } catch {
          // malformed JSON — ignore
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          content: "Brain's cooked rn -- probably hit the token limit or the embedding API is napping. Give it a sec and try again.",
          error: true,
        };
        return updated;
      });
    } finally {
      inFlightRef.current = false;
      setIsStreaming(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6 scrollbar-thin">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-6 px-4 animate-fade-in">
            {/* Brain icon with glow */}
            <div className="relative">
              <div className="absolute inset-0 bg-indigo-500/20 rounded-full blur-xl animate-glow" />
              <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-white/[0.08] flex items-center justify-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-indigo-400"
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
            </div>

            <div>
              <p className="text-sm text-gray-400 mb-1">Ask anything from your knowledge base</p>
              <p className="text-xs text-gray-600">I&apos;ll search through everything you&apos;ve saved</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-1 max-w-xl w-full">
              {suggestions.map((q, i) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="suggestion-card text-left text-sm px-4 py-3.5 rounded-xl border border-white/[0.06] bg-white/[0.03] text-gray-400 hover:text-gray-200 hover:border-indigo-500/30 hover:bg-indigo-500/[0.05] transition-all duration-200 animate-fade-in-up"
                  style={{ animationDelay: `${i * 75}ms`, animationFillMode: "both" }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-slide-up`}
          >
            <div
              className={`${msg.role === "user" ? "max-w-[85%] sm:max-w-[70%]" : "w-full max-w-3xl"}`}
            >
              {/* Bubble */}
              {msg.role === "user" ? (
                <div className="rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap bg-gradient-to-br from-indigo-600 to-indigo-700 text-white rounded-br-sm shadow-lg shadow-indigo-500/10">
                  {msg.content}
                </div>
              ) : (
                <div
                  className={`rounded-2xl px-4 py-3 text-sm leading-relaxed rounded-bl-sm ${
                    msg.error
                      ? "bg-red-500/10 border border-red-500/20 text-red-300"
                      : "bg-white/[0.04] border border-white/[0.06] text-gray-100"
                  }`}
                >
                  {msg.content ? (
                    <div
                      className="markdown-body"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                    />
                  ) : null}
                  {isStreaming && i === messages.length - 1 && (
                    <span className="inline-block w-1.5 h-4 bg-indigo-400 animate-pulse ml-0.5 rounded-sm align-middle" />
                  )}
                </div>
              )}

              {/* Sources — compact inline pills, max 3 */}
              {msg.role === "assistant" &&
                msg.sources &&
                msg.sources.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {msg.sources.slice(0, 3).map((src) => (
                      <a
                        key={src.id}
                        href={src.source_url ?? "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-[11px] pl-1.5 pr-2.5 py-1 rounded-full border border-white/[0.06] bg-white/[0.03] text-gray-400 hover:text-gray-200 hover:border-indigo-500/30 hover:bg-indigo-500/[0.05] transition-all"
                      >
                        <span className={`shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold ${
                          src.source_type === "tiktok" ? "bg-pink-500/15 text-pink-400" :
                          src.source_type === "article" ? "bg-violet-500/15 text-violet-400" :
                          "bg-gray-500/15 text-gray-400"
                        }`}>
                          {src.source_type === "tiktok" ? "T" : src.source_type === "article" ? "A" : "N"}
                        </span>
                        <span className="truncate max-w-[180px]">
                          {(src.title ?? "").replace(/^(Transcript|Source|Summary):\s*/i, "").slice(0, 50)}
                        </span>
                      </a>
                    ))}
                  </div>
                )}

              {/* Follow-up chips — small, tappable */}
              {msg.role === "assistant" &&
                !isStreaming &&
                msg.followups &&
                msg.followups.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {msg.followups.map((q) => (
                      <button
                        key={q}
                        onClick={() => sendMessage(q)}
                        className="text-[11px] px-2.5 py-1.5 rounded-full border border-indigo-500/15 bg-indigo-500/[0.04] text-indigo-300/80 hover:bg-indigo-500/[0.1] hover:border-indigo-500/30 hover:text-indigo-200 transition-all duration-150"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}
            </div>
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="px-3 sm:px-4 pb-3 sm:pb-4 pt-2 border-t border-white/[0.06] shrink-0">
        <div className="flex gap-2.5 items-end max-w-3xl mx-auto">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask something..."
            rows={1}
            className="flex-1 resize-none rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none input-glow transition-all leading-relaxed max-h-40 overflow-y-auto scrollbar-thin"
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || isStreaming}
            className="shrink-0 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 disabled:opacity-30 disabled:cursor-not-allowed px-5 py-3 text-sm font-medium text-white transition-all shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 disabled:shadow-none"
          >
            {isStreaming ? (
              <span className="flex items-center gap-1.5">
                <span className="w-1 h-1 bg-white rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1 h-1 bg-white rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1 h-1 bg-white rounded-full animate-bounce [animation-delay:300ms]" />
              </span>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            )}
          </button>
        </div>
        <p className="text-[11px] text-gray-600 text-center mt-2 tracking-wide">
          Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
