"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  ConnectAccountOnboarding,
  ConnectComponentsProvider,
} from "@stripe/react-connect-js";
import { loadConnectAndInitialize } from "@stripe/connect-js";
import { useRouter } from "next/navigation";

export default function ConnectOnboarding() {
  const router = useRouter();
  const [step, setStep] = useState<"intro" | "onboarding" | "complete">(
    "intro"
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectInstance, setConnectInstance] = useState<Awaited<
    ReturnType<typeof loadConnectAndInitialize>
  > | null>(null);

  const startOnboarding = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Step 1: Create Connect account if needed
      const accountRes = await fetch("/api/stripe/connect-account", {
        method: "POST",
      });
      const accountData = await accountRes.json();

      if (!accountRes.ok) {
        setError(accountData.error || "Failed to create account");
        setLoading(false);
        return;
      }

      // Step 2: Initialize Connect.js with a session fetcher
      const instance = loadConnectAndInitialize({
        publishableKey:
          process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
        fetchClientSecret: async () => {
          const res = await fetch("/api/stripe/connect-session", {
            method: "POST",
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          return data.clientSecret;
        },
        appearance: {
          overlays: "dialog",
          variables: {
            colorPrimary: "#091a12",
            colorBackground: "#faf7f0",
            colorText: "#091a12",
            colorDanger: "#dc2626",
            fontFamily: "Outfit, system-ui, sans-serif",
            borderRadius: "8px",
          },
        },
      });

      setConnectInstance(instance);
      setStep("onboarding");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  if (step === "complete") {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <span className="text-3xl text-green-700">&#10003;</span>
        </div>
        <h1 className="font-display text-4xl font-semibold text-green-900">
          Payments set up!
        </h1>
        <p className="mt-3 text-lg text-green-700">
          Your bank account is connected. You can now receive lesson payments
          from students.
        </p>
        <Button
          onClick={() => router.push("/pro/billing")}
          className="mt-8 bg-gold-600 text-white hover:bg-gold-500 rounded-md px-8 py-3 text-base font-medium"
        >
          Back to Billing
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-display text-3xl font-semibold text-green-900">
        Set Up Lesson Payments
      </h1>
      <p className="mt-2 text-green-700">
        Connect your bank account to receive payments from students.
      </p>

      {error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {step === "intro" && (
        <div className="mt-8 rounded-xl border border-green-200 bg-white p-8 shadow-sm">
          <h2 className="text-lg font-semibold text-green-900">
            How it works
          </h2>
          <ul className="mt-4 space-y-3 text-sm text-green-800">
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-semibold text-green-700">
                1
              </span>
              <span>
                Verify your identity and enter your bank account details (IBAN)
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-semibold text-green-700">
                2
              </span>
              <span>
                Students pay for lessons through the platform
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-semibold text-green-700">
                3
              </span>
              <span>
                Payments are deposited directly to your bank account via SEPA
                transfer (minus 2.5% platform fee)
              </span>
            </li>
          </ul>

          <div className="mt-6 rounded-lg border border-green-100 bg-green-50/50 px-4 py-3 text-sm text-green-700">
            Payment processing is handled securely by Stripe. Your banking
            details are never stored on our servers.
          </div>

          <Button
            onClick={startOnboarding}
            disabled={loading}
            className="mt-6 w-full bg-gold-600 text-white hover:bg-gold-500 rounded-md py-3 text-base font-medium"
          >
            {loading ? "Loading..." : "Get started"}
          </Button>
        </div>
      )}

      {step === "onboarding" && connectInstance && (
        <div className="mt-8 rounded-xl border border-green-200 bg-white p-6 shadow-sm">
          <ConnectComponentsProvider connectInstance={connectInstance}>
            <ConnectAccountOnboarding
              onExit={() => {
                setStep("complete");
                // Refresh server state
                router.refresh();
              }}
            />
          </ConnectComponentsProvider>
        </div>
      )}
    </div>
  );
}
