"use client";

import { useEffect, useRef, useState } from "react";
import SourceCard, { type Source } from "./SourceCard";

type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  error?: boolean;
};

const SOURCES_SENTINEL = "__SOURCES__";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

const FALLBACK_SUGGESTIONS = [
  "What did I save recently?",
  "Summarize my TikTok saves",
  "Any coding tips in my brain?",
];

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
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

      // Parse source attributions appended after the sentinel
      const sentinelIdx = buffer.indexOf(SOURCES_SENTINEL);
      if (sentinelIdx >= 0) {
        try {
          const sources: Source[] = JSON.parse(
            buffer.slice(sentinelIdx + SOURCES_SENTINEL.length)
          );
          setMessages((prev) => {
            if (assistantIdx < 0 || assistantIdx >= prev.length) return prev;
            const updated = [...prev];
            updated[assistantIdx] = { ...updated[assistantIdx], sources };
            return updated;
          });
        } catch {
          // malformed JSON — ignore, sources stay empty
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          content: "Something went wrong. Please try again.",
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
          <div className="flex flex-col items-center justify-center h-full text-center gap-4 px-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-gray-600"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <p className="text-sm text-gray-600">Ask anything from your knowledge base</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 max-w-xl w-full">
              {suggestions.map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="text-left text-sm px-4 py-3 rounded-xl border border-gray-800 bg-gray-900/50 text-gray-400 hover:text-gray-200 hover:border-indigo-600/50 hover:bg-gray-900 transition-all duration-150"
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
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] ${msg.role === "user" ? "max-w-[70%]" : "w-full max-w-3xl"}`}
            >
              {/* Bubble */}
              <div
                className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-indigo-600 text-white rounded-br-sm"
                    : msg.error
                    ? "bg-red-950 border border-red-800 text-red-300 rounded-bl-sm"
                    : "bg-gray-900 border border-gray-800 text-gray-100 rounded-bl-sm"
                }`}
              >
                {msg.content}
                {msg.role === "assistant" && isStreaming && i === messages.length - 1 && (
                  <span className="inline-block w-1.5 h-4 bg-gray-400 animate-pulse ml-0.5 rounded-sm align-middle" />
                )}
              </div>

              {/* Source attribution cards */}
              {msg.role === "assistant" &&
                msg.sources &&
                msg.sources.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-gray-600 px-1">Sources</p>
                    {msg.sources.map((src) => (
                      <SourceCard key={src.id} source={src} />
                    ))}
                  </div>
                )}
            </div>
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="px-4 pb-4 pt-2 border-t border-gray-800 shrink-0">
        <div className="flex gap-2 items-end max-w-3xl mx-auto">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask something…"
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-600 transition-colors leading-relaxed max-h-40 overflow-y-auto scrollbar-thin"
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isStreaming}
            className="shrink-0 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-3 text-sm font-medium text-white transition-colors"
          >
            {isStreaming ? (
              <span className="flex items-center gap-1.5">
                <span className="w-1 h-1 bg-white rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1 h-1 bg-white rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1 h-1 bg-white rounded-full animate-bounce [animation-delay:300ms]" />
              </span>
            ) : (
              "Send"
            )}
          </button>
        </div>
        <p className="text-xs text-gray-700 text-center mt-2">
          Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
