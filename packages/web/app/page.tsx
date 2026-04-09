"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ChatInterface, { type Message } from "@/components/ChatInterface";
import ConversationHistory, {
  type Conversation,
  loadConversations,
  saveConversations,
  generateTitle,
} from "@/components/ConversationHistory";
import Link from "next/link";

export default function Home() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isStreamingRef = useRef(false);

  // Load conversations from localStorage on mount
  useEffect(() => {
    setConversations(loadConversations());
  }, []);

  // Persist conversations whenever messages change
  const handleMessagesChange = useCallback(
    (updatedMessages: Message[]) => {
      // Track streaming state to avoid saving incomplete mid-stream messages
      const hasEmptyAssistant = updatedMessages.some(
        (m) => m.role === "assistant" && m.content === ""
      );
      if (hasEmptyAssistant) {
        isStreamingRef.current = true;
        return;
      }
      // If we were streaming and now content is present, allow save
      isStreamingRef.current = false;

      if (updatedMessages.length === 0) return;

      setConversations((prev) => {
        let updated: Conversation[];

        if (activeId) {
          // Update existing conversation
          updated = prev.map((c) =>
            c.id === activeId
              ? { ...c, messages: updatedMessages, title: generateTitle(updatedMessages) }
              : c
          );
        } else {
          // Create new conversation
          const newId = crypto.randomUUID();
          const newConv: Conversation = {
            id: newId,
            title: generateTitle(updatedMessages),
            messages: updatedMessages,
            createdAt: Date.now(),
          };
          updated = [newConv, ...prev];
          // Set active ID without triggering a load
          setActiveId(newId);
        }

        saveConversations(updated);
        return updated;
      });
    },
    [activeId]
  );

  const handleNewChat = useCallback(() => {
    setActiveId(null);
    setMessages([]);
    setSidebarOpen(false);
  }, []);

  const handleLoadConversation = useCallback(
    (id: string) => {
      const conv = conversations.find((c) => c.id === id);
      if (!conv) return;
      setActiveId(id);
      setMessages(conv.messages as Message[]);
      setSidebarOpen(false);
    },
    [conversations]
  );

  const handleDeleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => {
        const updated = prev.filter((c) => c.id !== id);
        saveConversations(updated);
        return updated;
      });
      if (activeId === id) {
        setActiveId(null);
        setMessages([]);
      }
    },
    [activeId]
  );

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  return (
    <div className="flex h-full">
      {/* Conversation history sidebar */}
      <ConversationHistory
        conversations={conversations}
        activeConversationId={activeId}
        isOpen={sidebarOpen}
        onToggle={toggleSidebar}
        onNewChat={handleNewChat}
        onLoadConversation={handleLoadConversation}
        onDeleteConversation={handleDeleteConversation}
      />

      {/* Main content area */}
      <div className="flex flex-col flex-1 min-w-0 h-full">
        {/* Header */}
        <header className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-white/[0.06] shrink-0 gap-2 glass">
          <div className="flex items-center gap-3 shrink-0">
            {/* Hamburger toggle */}
            <button
              onClick={toggleSidebar}
              className="p-1.5 -ml-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.06] transition-all duration-150"
              aria-label="Toggle conversation history"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>

            <div>
              <h1 className="text-base sm:text-lg font-bold text-gradient">Andy&apos;s Brain</h1>
              <p className="text-[11px] text-gray-500 hidden sm:block tracking-wide">Personal knowledge base</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
            <Link
              href="/entries"
              className="text-xs sm:text-sm px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.06] text-gray-300 hover:text-white transition-all duration-200"
            >
              Browse
            </Link>
            <Link
              href="/bookmarklet"
              className="text-xs sm:text-sm px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.06] text-gray-300 hover:text-white transition-all duration-200"
            >
              Capture
            </Link>
            <Link
              href="/add"
              className="text-xs sm:text-sm px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/20 text-indigo-300 hover:text-indigo-200 transition-all duration-200"
            >
              + Add
            </Link>
          </div>
        </header>

        {/* Chat takes the remaining height */}
        <div className="flex-1 min-h-0">
          <ChatInterface
            messages={messages}
            setMessages={setMessages}
            onMessagesChange={handleMessagesChange}
          />
        </div>
      </div>
    </div>
  );
}
