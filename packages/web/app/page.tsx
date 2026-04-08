import ChatInterface from "@/components/ChatInterface";
import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-white/[0.06] shrink-0 gap-2 glass">
        <div className="shrink-0">
          <h1 className="text-base sm:text-lg font-bold text-gradient">Andy&apos;s Brain</h1>
          <p className="text-[11px] text-gray-500 hidden sm:block tracking-wide">Personal knowledge base</p>
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
        <ChatInterface />
      </div>
    </div>
  );
}
