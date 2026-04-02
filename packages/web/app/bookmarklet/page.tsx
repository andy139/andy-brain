"use client";

import { useState } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4001";

function buildBookmarklet(apiKey: string, apiUrl: string): string {
  return (
    `javascript:(function(){` +
    `fetch('${apiUrl}/api/ingest/quick',{` +
    `method:'POST',` +
    `headers:{'Content-Type':'application/json','x-api-key':'${apiKey}'},` +
    `body:JSON.stringify({url:location.href})` +
    `}).then(function(r){return r.json()}).then(function(d){` +
    `alert(d.entry_id?'Saved ('+d.chunks_created+' chunks)':'Error: '+(d.error||'unknown'));` +
    `}).catch(function(){alert('Network error — is the API running?')});` +
    `})()`
  );
}

export default function BookmarkletPage() {
  const [apiKey, setApiKey] = useState("");
  const [copied, setCopied] = useState(false);

  const bookmarklet = apiKey ? buildBookmarklet(apiKey, API_URL) : null;

  async function copyShortcut() {
    const shortcutText = `iOS Shortcut setup:
1. Open the Shortcuts app → New Shortcut
2. Add action: "Get Contents of URL"
   - URL: ${API_URL}/api/ingest/quick
   - Method: POST
   - Headers: Content-Type = application/json, x-api-key = ${apiKey || "YOUR_KEY"}
   - Body: JSON → { "url": "Shortcut Input" }
3. Add action: "Show Notification" with the result
4. Share sheet: enable "Safari" as input type`;
    await navigator.clipboard.writeText(shortcutText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-full bg-gray-950">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors mb-8"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Back to chat
        </Link>

        <h1 className="text-2xl font-semibold text-white mb-2">One-click capture</h1>
        <p className="text-sm text-gray-400 mb-8">
          Save any webpage to your brain without opening the app.
        </p>

        {/* API key input */}
        <div className="mb-8">
          <label className="block text-sm font-medium text-gray-300 mb-2">Your API key</label>
          <input
            type="password"
            placeholder="Paste your AUTH_TOKEN"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <p className="mt-1.5 text-xs text-gray-600">Stays in your browser — never sent anywhere except your own API.</p>
        </div>

        {/* Bookmarklet */}
        <div className="mb-8 rounded-lg border border-gray-800 bg-gray-900/50 p-5">
          <h2 className="text-sm font-semibold text-white mb-1">Browser bookmarklet</h2>
          <p className="text-xs text-gray-500 mb-4">
            Drag the button below to your bookmarks bar. Then click it on any page to save it instantly.
          </p>

          {apiKey ? (
            <a
              href={bookmarklet!}
              onClick={(e) => e.preventDefault()}
              draggable
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white transition-colors cursor-grab select-none"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
              Save to Brain
            </a>
          ) : (
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-gray-800 text-sm text-gray-500 cursor-not-allowed select-none">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
              Save to Brain
            </div>
          )}

          {!apiKey && (
            <p className="mt-3 text-xs text-gray-600">Enter your API key above to activate the bookmarklet.</p>
          )}
          {apiKey && (
            <p className="mt-3 text-xs text-gray-500">
              Drag to bookmarks bar. Clicking it on any page will extract and save the content.
              Source type is auto-detected (x.com → X, tiktok.com → TikTok, everything else → article).
            </p>
          )}
        </div>

        {/* iOS Shortcut */}
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-5">
          <h2 className="text-sm font-semibold text-white mb-1">iOS Shortcut</h2>
          <p className="text-xs text-gray-500 mb-4">
            Save from Safari on iPhone via the Share Sheet.
          </p>

          <ol className="space-y-2 text-xs text-gray-400 mb-4">
            <li><span className="text-gray-600 mr-1.5">1.</span>Open the <span className="text-gray-200">Shortcuts</span> app → tap <span className="text-gray-200">+</span> → New Shortcut</li>
            <li><span className="text-gray-600 mr-1.5">2.</span>Add action: <span className="text-gray-200">Get Contents of URL</span></li>
            <li>
              <span className="text-gray-600 mr-1.5"> </span>
              <span className="ml-3 block mt-1 font-mono text-gray-500 bg-gray-950 rounded px-2 py-1.5 leading-relaxed">
                URL: {API_URL}/api/ingest/quick<br />
                Method: POST<br />
                Headers:<br />
                {"  "}Content-Type: application/json<br />
                {"  "}x-api-key: {apiKey || "YOUR_KEY"}<br />
                Body: JSON<br />
                {"  "}url: Shortcut Input
              </span>
            </li>
            <li><span className="text-gray-600 mr-1.5">3.</span>Add action: <span className="text-gray-200">Show Notification</span> with the output</li>
            <li><span className="text-gray-600 mr-1.5">4.</span>Tap the shortcut name → <span className="text-gray-200">Share Sheet</span> → enable <span className="text-gray-200">Safari</span></li>
          </ol>

          <button
            onClick={copyShortcut}
            disabled={!apiKey}
            className="text-xs px-3 py-1.5 rounded-md bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-300 transition-colors"
          >
            {copied ? "Copied!" : "Copy instructions"}
          </button>
          {!apiKey && <p className="mt-2 text-xs text-gray-600">Enter your API key above to include it in the instructions.</p>}
        </div>
      </div>
    </div>
  );
}
