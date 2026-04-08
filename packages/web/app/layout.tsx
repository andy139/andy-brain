import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Andy's Brain",
  description: "Ask anything from my personal knowledge base",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark h-full">
      <body className="h-full bg-[#0a0a12] text-gray-100 antialiased font-sans relative overflow-hidden">
        {/* Ambient gradient orbs */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-indigo-600/[0.07] blur-[120px] animate-pulse-slow" />
          <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-violet-600/[0.05] blur-[120px] animate-pulse-slow [animation-delay:1.5s]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-indigo-500/[0.03] blur-[100px]" />
        </div>
        <div className="relative h-full">{children}</div>
      </body>
    </html>
  );
}
