"use client";

import { useState, useTransition } from "react";
import { updateGolfProfile } from "./actions";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n/translations";

const GOALS = [
  { id: "driving", label: "Driving" },
  { id: "short_game", label: "Short Game" },
  { id: "putting", label: "Putting" },
  { id: "course_management", label: "Course Management" },
  { id: "learn_basics", label: "Learn the Basics" },
  { id: "fitness", label: "Fitness & Flexibility" },
];

const inputClass =
  "block w-full rounded-lg border border-green-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500";

export function GolfProfileSection({
  initialHandicap,
  initialGoals,
  initialGoalsOther,
  locale,
}: {
  initialHandicap: string;
  initialGoals: string[];
  initialGoalsOther: string;
  locale: Locale;
}) {
  const [isPending, startTransition] = useTransition();
  const [handicap, setHandicap] = useState(initialHandicap);
  const [goals, setGoals] = useState<string[]>(initialGoals);
  const [goalsOther, setGoalsOther] = useState(initialGoalsOther);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  function toggleGoal(goalId: string) {
    if (goalId === "other") {
      if (goals.includes("other")) {
        setGoals(goals.filter((g) => g !== "other"));
        setGoalsOther("");
      } else {
        setGoals([...goals, "other"]);
      }
    } else if (goals.includes(goalId)) {
      setGoals(goals.filter((g) => g !== goalId));
    } else {
      setGoals([...goals, goalId]);
    }
  }

  function handleSave() {
    setMessage(null);
    startTransition(async () => {
      const result = await updateGolfProfile({
        handicap: handicap || null,
        golfGoals: goals,
        golfGoalsOther: goalsOther || null,
      });
      if (result.error) {
        setMessage({ type: "error", text: result.error });
      } else {
        setMessage({ type: "success", text: t("profile.saved", locale) });
      }
    });
  }

  return (
    <div>
      <h2 className="font-display text-xl font-semibold text-green-950">
        {t("onboarding.golfProfile", locale)}
      </h2>

      <div className="mt-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-green-800">
            {t("onboarding.handicap", locale)}{" "}
            <span className="font-normal text-green-500">
              ({t("onboarding.handicapOptional", locale)})
            </span>
          </label>
          <input
            type="number"
            value={handicap}
            onChange={(e) => setHandicap(e.target.value)}
            placeholder="e.g. 18.4"
            min="0"
            max="54"
            step="0.1"
            className={inputClass + " max-w-[200px]"}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-green-800">
            {t("onboarding.goals", locale)}
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            {GOALS.map((goal) => (
              <button
                key={goal.id}
                type="button"
                onClick={() => toggleGoal(goal.id)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  goals.includes(goal.id)
                    ? "border-green-700 bg-green-700 text-white"
                    : "border-green-200 bg-white text-green-700 hover:border-green-400"
                }`}
              >
                {t(`onboarding.goal.${goal.id}`, locale)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => toggleGoal("other")}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                goals.includes("other")
                  ? "border-green-700 bg-green-700 text-white"
                  : "border-green-200 bg-white text-green-700 hover:border-green-400"
              }`}
            >
              {t("onboarding.goal.other", locale)}
            </button>
          </div>
          {goals.includes("other") && (
            <input
              type="text"
              value={goalsOther}
              onChange={(e) => setGoalsOther(e.target.value)}
              placeholder={t("onboarding.goalOtherPlaceholder", locale)}
              className={inputClass + " mt-2"}
            />
          )}
        </div>

        {message && (
          <p
            className={`text-sm ${
              message.type === "error" ? "text-red-600" : "text-green-700"
            }`}
          >
            {message.text}
          </p>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="rounded-lg bg-green-800 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {isPending
            ? t("profile.saving", locale)
            : t("profile.save", locale)}
        </button>
      </div>
    </div>
  );
}
