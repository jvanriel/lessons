"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SiteAccessPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(false);
    setLoading(true);

    const res = await fetch("/api/site-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      setError(true);
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-green-950 px-6">
      <div className="w-full max-w-sm text-center">
        <svg
          className="mx-auto h-12 w-12 text-gold-300"
          viewBox="0 0 48 48"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <line x1="32" y1="6" x2="32" y2="36" strokeLinecap="round" />
          <path d="M32 6 L19 11.5 L32 17 Z" fill="currentColor" opacity={0.9} />
          <circle cx="16" cy="34" r="5.5" fill="currentColor" opacity={0.2} />
        </svg>
        <h1 className="mt-6 font-display text-2xl font-bold text-gold-200">
          Golf Lessons
        </h1>
        <p className="mt-2 text-sm text-green-100/60">
          This site is in pre-launch. Enter the password to continue.
        </p>
        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            className="block w-full rounded-lg border border-green-700 bg-green-900 px-4 py-3 text-center text-sm text-white placeholder-green-400 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
          />
          {error && (
            <p className="text-sm text-red-400">Incorrect password</p>
          )}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full rounded-lg bg-gold-600 px-4 py-3 text-sm font-medium text-white hover:bg-gold-500 disabled:opacity-50"
          >
            {loading ? "Checking..." : "Enter"}
          </button>
        </form>
      </div>
    </div>
  );
}
