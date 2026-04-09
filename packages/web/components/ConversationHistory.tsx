"use client";

import { useState } from "react";

export type Conversation = {
  id: string;
  title: string;
  messages: { role: "user" | "assistant"; content: string; sources?: unknown[]; followups?: string[]; error?: boolean }[];
  createdAt: number;
};

const STORAGE_KEY = "andy-brain-conversations";
const MAX_CONVERSATIONS = 20;

/** Read conversations from localStorage */
export function loadConversations(): Conversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Conversation[];
    return parsed.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

/** Persist conversations to localStorage, enforcing max limit */
export function saveConversations(conversations: Conversation[]): void {
  if (typeof window === "undefined") return;
  const trimmed = conversations
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_CONVERSATIONS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

/** Generate a title from the first user message, truncated to 40 chars */
export function generateTitle(messages: Conversation["messages"]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "New conversation";
  const text = firstUser.content.trim();
  if (text.length <= 40) return text;
  return text.slice(0, 40) + "...";
}

/** Format a timestamp as a relative string */
function relativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(timestamp).toLocaleDateString();
}

type Props = {
  conversations: Conversation[];
  activeConversationId: string | null;
  isOpen: boolean;
  onToggle: () => void;
  onNewChat: () => void;
  onLoadConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
};

export default function ConversationHistory({
  conversations,
  activeConversationId,
  isOpen,
  onToggle,
  onNewChat,
  onLoadConversation,
  onDeleteConversation,
}: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <>
      {/* Mobile overlay backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={onToggle}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={`
          fixed md:relative z-40 top-0 left-0 h-full
          flex flex-col
          bg-[#0a0a12]/95 backdrop-blur-xl
          border-r border-white/[0.06]
          transition-all duration-300 ease-in-out
          ${isOpen ? "w-[250px] translate-x-0" : "w-0 -translate-x-full md:translate-x-0 md:w-0"}
          overflow-hidden shrink-0
        `}
      >
        <div className="flex flex-col h-full min-w-[250px]">
          {/* New chat button */}
          <div className="p-3 border-b border-white/[0.06]">
            <button
              onClick={onNewChat}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-white/[0.08] bg-white/[0.03] text-gray-300 hover:text-white hover:bg-white/[0.06] hover:border-indigo-500/30 transition-all duration-200 text-sm"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New chat
            </button>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto scrollbar-thin py-2">
            {conversations.length === 0 ? (
              <p className="text-xs text-gray-600 text-center px-4 py-8">
                No conversations yet
              </p>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  onMouseEnter={() => setHoveredId(conv.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => onLoadConversation(conv.id)}
                  className={`
                    group relative flex items-center gap-2 px-3 py-2.5 mx-2 rounded-lg cursor-pointer
                    transition-all duration-150
                    ${
                      activeConversationId === conv.id
                        ? "bg-indigo-500/10 border border-indigo-500/20 text-gray-100"
                        : "border border-transparent text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]"
                    }
                  `}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate leading-snug">{conv.title}</p>
                    <p className="text-[10px] text-gray-600 mt-0.5">
                      {relativeTime(conv.createdAt)}
                    </p>
                  </div>

                  {/* Delete button on hover */}
                  {hoveredId === conv.id && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteConversation(conv.id);
                      }}
                      className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Delete conversation"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Close button (bottom) for mobile */}
          <div className="p-3 border-t border-white/[0.06] md:hidden">
            <button
              onClick={onToggle}
              className="w-full text-xs text-gray-500 hover:text-gray-300 transition-colors py-1.5"
            >
              Close sidebar
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
