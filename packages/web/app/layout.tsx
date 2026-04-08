import type { Metadata } from "next";
import dynamic from "next/dynamic";
import "./globals.css";

const BrainBackground = dynamic(() => import("@/components/BrainBackground"), {
  ssr: false,
});

export const metadata: Metadata = {
  title: "Andy's Brain",
  description: "Ask anything from my personal knowledge base",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark h-full">
      <body className="h-full bg-[#0a0a12] text-gray-100 antialiased font-sans relative overflow-hidden">
        {/* 3D brain visualization */}
        <BrainBackground />
        {/* Ambient gradient orbs */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-[1]">
          <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-indigo-600/[0.07] blur-[120px] animate-pulse-slow" />
          <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-violet-600/[0.05] blur-[120px] animate-pulse-slow [animation-delay:1.5s]" />
        </div>
        <div className="relative h-full z-[2]">{children}</div>
      </body>
    </html>
  );
}
