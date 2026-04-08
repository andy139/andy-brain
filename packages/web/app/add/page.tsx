import AddEntryForm from "@/components/AddEntryForm";
import Link from "next/link";

export default function AddPage() {
  return (
    <div className="min-h-full">
      <div className="max-w-2xl mx-auto px-4 py-10">
        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-200 transition-colors mb-8 group"
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
            className="group-hover:-translate-x-0.5 transition-transform"
          >
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Back to chat
        </Link>

        <h1 className="text-2xl font-bold text-gradient mb-2">Add knowledge</h1>
        <p className="text-sm text-gray-400 mb-8">
          Save an article, note, tweet, or any piece of content to your knowledge base.
        </p>

        <AddEntryForm />
      </div>
    </div>
  );
}
