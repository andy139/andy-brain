import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Andy's Brain",
  description: "Ask anything from my personal knowledge base",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark h-full">
      <body className="h-full bg-gray-950 text-gray-100 antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
