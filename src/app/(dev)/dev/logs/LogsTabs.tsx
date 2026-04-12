"use client";

import { useState } from "react";
import LogsBrowser from "./LogsBrowser";
import RuntimeLogs from "./RuntimeLogs";

type Tab = "events" | "runtime";

export default function LogsTabs() {
  const [tab, setTab] = useState<Tab>("events");

  return (
    <div>
      <div className="mb-5 flex gap-1 border-b border-green-200">
        <TabButton active={tab === "events"} onClick={() => setTab("events")}>
          Events
          <span className="ml-2 text-[10px] text-green-500">
            (app · Postgres)
          </span>
        </TabButton>
        <TabButton active={tab === "runtime"} onClick={() => setTab("runtime")}>
          Runtime
          <span className="ml-2 text-[10px] text-green-500">(Vercel API)</span>
        </TabButton>
      </div>

      {tab === "events" && <LogsBrowser />}
      {tab === "runtime" && <RuntimeLogs />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px rounded-t-md border border-b-0 px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? "border-green-200 bg-white text-green-950"
          : "border-transparent text-green-600 hover:text-green-800"
      }`}
    >
      {children}
    </button>
  );
}
