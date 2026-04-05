import ChatInterface from "@/components/ChatInterface";
import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4 border-b border-gray-800 shrink-0 gap-2">
        <div className="shrink-0">
          <h1 className="text-base sm:text-lg font-semibold text-white">Andy&apos;s Brain</h1>
          <p className="text-xs text-gray-500 hidden sm:block">Personal knowledge base</p>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
          <Link
            href="/entries"
            className="text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-1.5 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-200 transition-colors"
          >
            Browse
          </Link>
          <Link
            href="/bookmarklet"
            className="text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-1.5 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-200 transition-colors"
          >
            Capture
          </Link>
          <Link
            href="/add"
            className="text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-1.5 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-200 transition-colors"
          >
            + Add
          </Link>
        </div>
      </header>

      {/* Chat takes the remaining height */}
      <div className="flex-1 min-h-0">
        <ChatInterface />
      </div>

      {/* Footer */}
      <footer className="text-center text-xs text-gray-600 py-2 border-t border-gray-900 shrink-0">
        Powered by Andy's Knowledge Base
      </footer>
    </div>
  );
}
