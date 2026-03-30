import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100">
      <div className="text-center space-y-8">
        <h1 className="text-5xl font-bold tracking-tight">Golf Lessons</h1>
        <p className="text-zinc-400 text-lg">Mockup pages for look &amp; feel</p>
        <nav className="flex flex-col gap-3">
          <Link href="/mockups/pro-profile" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-4">
            Pro Public Profile
          </Link>
          <Link href="/mockups/booking" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-4">
            Student Booking Flow
          </Link>
          <Link href="/mockups/student-page" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-4">
            Student Personal Page
          </Link>
        </nav>
      </div>
    </div>
  );
}
