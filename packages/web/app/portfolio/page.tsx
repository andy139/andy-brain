"use client";

import { useEffect, useRef, useState } from "react";

const FOLLOWUPS_SENTINEL = "__FOLLOWUPS__";

const URL_REGEX = /(https?:\/\/[^\s]+|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|(?:linkedin|github)\.com\/[^\s]+)/g;
const MD_REGEX = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`]+`)/g;

function renderInlineSegment(text: string, keyPrefix: string) {
  return text.split(URL_REGEX).map((part, i) => {
    if (!part) return null;
    const isEmail = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(part);
    const isUrl = /^https?:\/\//.test(part) || /^(?:linkedin|github)\.com/.test(part);
    if (isEmail) return <a key={`${keyPrefix}-e${i}`} href={`mailto:${part}`} className="text-indigo-400 underline hover:text-indigo-300">{part}</a>;
    if (isUrl) {
      const href = part.startsWith("http") ? part : `https://${part}`;
      return <a key={`${keyPrefix}-u${i}`} href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-400 underline hover:text-indigo-300">{part}</a>;
    }
    return <span key={`${keyPrefix}-t${i}`}>{part}</span>;
  });
}

function MarkdownText({ text }: { text: string }) {
  const parts = text.split(MD_REGEX);
  return (
    <>
      {parts.map((part, i) => {
        if (!part) return null;
        if (/^\*\*[^*\n]+\*\*$/.test(part)) {
          return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
        }
        if (/^\*[^*\n]+\*$/.test(part)) {
          return <em key={i} className="italic">{part.slice(1, -1)}</em>;
        }
        if (/^`[^`]+`$/.test(part)) {
          return <code key={i} className="bg-indigo-500/10 px-1.5 rounded text-indigo-300 text-xs font-mono border border-indigo-500/10">{part.slice(1, -1)}</code>;
        }
        return <span key={i}>{renderInlineSegment(part, String(i))}</span>;
      })}
    </>
  );
}

type Message = {
  role: "user" | "assistant";
  content: string;
  followups?: string[];
  ttft?: number;
  error?: boolean;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

const SUGGESTIONS = [
  "Tell me about Andy's background.",
  "Where has he worked?",
  "What are his strongest skills?",
  "Tell me about his AI projects.",
  "What kind of role is he looking for?",
  "Is he available right now?",
  "What's he most proud of building?",
  "How does he approach a hard engineering problem?",
];

export default function PortfolioDemo() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const copy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1500);
    });
  };

  const reset = () => {
    setMessages([]);
    setInput("");
  };

  const send = async (question: string) => {
    if (!question.trim() || isStreaming) return;
    setInput("");
    const startTime = Date.now();

    setMessages((prev) => [
      ...prev,
      { role: "user", content: question },
      { role: "assistant", content: "" },
    ]);
    setIsStreaming(true);

    try {
      const res = await fetch(`${API_URL}/api/portfolio/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let ttftRecorded = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const sentinelIdx = buffer.indexOf(FOLLOWUPS_SENTINEL);
        const displayText = sentinelIdx >= 0 ? buffer.slice(0, sentinelIdx) : buffer;

        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          const patch: Partial<Message> = { content: displayText };
          if (!ttftRecorded && displayText.length > 0) {
            patch.ttft = Date.now() - startTime;
            ttftRecorded = true;
          }
          updated[updated.length - 1] = { ...last, ...patch };
          return updated;
        });
      }

      // Parse follow-ups, always append contact chip
      const sentinelIdx = buffer.indexOf(FOLLOWUPS_SENTINEL);
      const aiFollowups: string[] = [];
      if (sentinelIdx >= 0) {
        try {
          const parsed = JSON.parse(buffer.slice(sentinelIdx + FOLLOWUPS_SENTINEL.length));
          aiFollowups.push(...parsed);
        } catch { /* malformed — skip */ }
      }
      const followups = [...aiFollowups, "What's Andy's contact info?"];
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { ...updated[updated.length - 1], followups };
        return updated;
      });
    } catch {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          content: "Ran out of tokens. Andy's brain needs a snack -- try again in a sec.",
          error: true,
        };
        return updated;
      });
    } finally {
      setIsStreaming(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-white/[0.06] shrink-0 glass">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-base sm:text-lg font-bold text-gradient">Andy&apos;s Brain</h1>
            <p className="text-[11px] text-gray-500 tracking-wide">Portfolio demo — ask me about Andy</p>
          </div>
          {messages.length > 0 && (
            <button
              onClick={reset}
              className="text-xs text-gray-600 hover:text-gray-300 transition-colors ml-2"
            >
              Start over
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <a
            href="https://linkedin.com/in/andytran1140"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
            LinkedIn
          </a>
          <span className="flex items-center gap-1.5 text-xs text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live
          </span>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6 scrollbar-thin">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-5 px-2 animate-fade-in">
            <div className="relative">
              <div className="absolute inset-0 bg-indigo-500/20 rounded-full blur-xl animate-glow" />
              <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-white/[0.08] flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-400">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
            </div>
            <p className="text-gray-400 text-sm">Click a question or ask your own</p>
            <div className="grid grid-cols-2 gap-2.5 max-w-xl w-full">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="suggestion-card text-left text-sm px-4 py-3.5 rounded-xl border border-white/[0.06] bg-white/[0.03] text-gray-400 hover:text-gray-200 hover:border-indigo-500/30 hover:bg-indigo-500/[0.05] transition-all duration-200 leading-snug animate-fade-in-up"
                  style={{ animationDelay: `${i * 60}ms`, animationFillMode: "both" }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"} animate-slide-up`}>
            <div className={`${msg.role === "user" ? "max-w-[70%]" : "w-full max-w-2xl"}`}>

              {/* Bubble */}
              <div className="relative group">
                <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-gradient-to-br from-indigo-600 to-indigo-700 text-white rounded-br-sm shadow-lg shadow-indigo-500/10"
                    : msg.error
                    ? "bg-red-500/10 border border-red-500/20 text-red-300 rounded-bl-sm"
                    : "bg-white/[0.04] border border-white/[0.06] text-gray-100 rounded-bl-sm"
                }`}>
                  {/* Typing indicator before first token */}
                  {msg.role === "assistant" && msg.content === "" && isStreaming && i === messages.length - 1 ? (
                    <span className="flex items-center gap-1 h-4">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400/50 animate-bounce [animation-delay:0ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400/50 animate-bounce [animation-delay:150ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400/50 animate-bounce [animation-delay:300ms]" />
                    </span>
                  ) : (
                    <>
                      <MarkdownText text={msg.content} />
                      {msg.role === "assistant" && isStreaming && i === messages.length - 1 && (
                        <span className="inline-block w-1.5 h-4 bg-indigo-400 animate-pulse ml-0.5 rounded-sm align-middle" />
                      )}
                    </>
                  )}
                </div>

                {/* Copy button — assistant only, after streaming */}
                {msg.role === "assistant" && !msg.error && !(isStreaming && i === messages.length - 1) && (
                  <button
                    onClick={() => copy(msg.content, i)}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-gray-600 hover:text-gray-300 p-1.5 rounded-lg hover:bg-white/[0.06]"
                    aria-label="Copy response"
                  >
                    {copiedIdx === i ? (
                      <span className="text-xs text-emerald-400">Copied!</span>
                    ) : (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                      </svg>
                    )}
                  </button>
                )}
              </div>

              {/* Follow-up chips + TTFT */}
              {msg.role === "assistant" && msg.followups && msg.followups.length > 0 && (
                <div className="mt-3">
                  <div className="flex flex-wrap gap-2">
                    {msg.followups.map((q) => (
                      <button
                        key={q}
                        onClick={() => send(q)}
                        disabled={isStreaming}
                        className="text-xs px-3 py-1.5 rounded-full border border-white/[0.06] bg-white/[0.03] text-gray-400 hover:border-indigo-500/30 hover:text-white hover:bg-indigo-500/[0.05] transition-all disabled:opacity-30"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                  {msg.ttft && (
                    <p className="text-[11px] text-gray-600 mt-1.5">responded in {(msg.ttft / 1000).toFixed(1)}s</p>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-3 sm:px-4 pb-3 sm:pb-4 pt-2 border-t border-white/[0.06] shrink-0">
        <div className="flex gap-2.5 items-center max-w-2xl mx-auto">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") send(input); }}
            placeholder="Ask anything about Andy..."
            className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none input-glow transition-all"
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || isStreaming}
            className="shrink-0 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 disabled:opacity-30 disabled:cursor-not-allowed px-5 py-3 text-sm font-medium text-white transition-all shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 disabled:shadow-none"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
