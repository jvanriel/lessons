"use client";

import { useState, useRef } from "react";

export function HelpButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-green-200 p-1.5 text-green-500 transition-colors hover:bg-green-50 hover:text-green-700"
        title="Help"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827m0 0v.75m0-3.375v.008" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      </button>
      {open && <MemberHelpDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function MemberHelpDialog({ onClose }: { onClose: () => void }) {
  const backdropRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-16"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-xl border border-green-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-green-100 px-5 py-4">
          <h3 className="font-display text-lg font-semibold text-green-900">
            Your Dashboard
          </h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-green-400 hover:text-green-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-5 px-5 py-5 text-sm text-green-700 leading-relaxed">
          <div>
            <h4 className="font-medium text-green-900">Your Pros</h4>
            <p className="mt-1">
              This section shows the golf professionals you&apos;re connected with.
              From here you can:
            </p>
            <ul className="mt-2 space-y-1 pl-4">
              <li className="relative pl-3 before:absolute before:left-0 before:top-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-gold-500">
                <strong className="text-green-900">Chat</strong> — open a coaching conversation with your pro
              </li>
              <li className="relative pl-3 before:absolute before:left-0 before:top-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-gold-500">
                <strong className="text-green-900">Book a lesson</strong> — use the full booking wizard to pick a date and time
              </li>
              <li className="relative pl-3 before:absolute before:left-0 before:top-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-gold-500">
                <strong className="text-green-900">Manage</strong> — add or remove pros
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-medium text-green-900">Quick Book</h4>
            <p className="mt-1">
              After your first lesson, Quick Book appears on each pro card. It remembers
              your preferred location, duration, day, and time — so you can rebook in
              one tap.
            </p>
            <ul className="mt-2 space-y-1 pl-4">
              <li className="relative pl-3 before:absolute before:left-0 before:top-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-gold-500">
                <strong className="text-green-900">Date pills</strong> — tap to switch between
                suggested dates. Use the arrows to navigate.
              </li>
              <li className="relative pl-3 before:absolute before:left-0 before:top-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-gold-500">
                <strong className="text-green-900">Hold a time slot</strong> — press and hold for
                half a second to instantly book that slot.
              </li>
              <li className="relative pl-3 before:absolute before:left-0 before:top-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-gold-500">
                <strong className="text-green-900">In a week / 2 weeks / month</strong> — jump
                to a future date. These are suggestions, not recurring bookings.
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-medium text-green-900">Understanding available times</h4>
            <p className="mt-1">
              <strong>Press and hold a date</strong> (not a time slot) to see exactly why
              specific times are available or unavailable. The dialog explains:
            </p>
            <ul className="mt-2 space-y-1 pl-4">
              <li className="relative pl-3 before:absolute before:left-0 before:top-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-gold-500">
                Your <strong>preferred day</strong> and how it affects date suggestions
              </li>
              <li className="relative pl-3 before:absolute before:left-0 before:top-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-gold-500">
                The pro&apos;s <strong>availability</strong> for that day of the week
              </li>
              <li className="relative pl-3 before:absolute before:left-0 before:top-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-gold-500">
                Any <strong>schedule changes</strong> or blocks set by the pro
              </li>
              <li className="relative pl-3 before:absolute before:left-0 before:top-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-gold-500">
                <strong>Existing bookings</strong> from other students
              </li>
              <li className="relative pl-3 before:absolute before:left-0 before:top-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-gold-500">
                The <strong>booking notice</strong> period (e.g. 24h) — slots too close to now are unavailable
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-medium text-green-900">Booking notice</h4>
            <p className="mt-1">
              Each pro sets a minimum notice period (shown next to &quot;Quick Book&quot;, e.g.
              &quot;24h notice&quot;). You cannot book a slot that starts within this window.
              For example, with 24h notice, you can&apos;t book a lesson for tomorrow if
              it&apos;s already past the same time today.
            </p>
          </div>

          <div>
            <h4 className="font-medium text-green-900">Your upcoming lessons</h4>
            <p className="mt-1">
              Below your pros, you&apos;ll see a list of your upcoming confirmed lessons.
              You can cancel a lesson by clicking the cancel button — make sure to check
              the pro&apos;s cancellation policy first.
            </p>
          </div>

          <div>
            <h4 className="font-medium text-green-900">Your profile</h4>
            <p className="mt-1">
              Tap the person icon in the top right to access your profile. From there
              you can update your name, handicap, goals, payment method, booking
              preferences, language, and password.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
