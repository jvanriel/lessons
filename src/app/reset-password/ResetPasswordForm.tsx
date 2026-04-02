"use client";

import { useActionState } from "react";
import { resetPasswordWithToken } from "./actions";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import type { Locale } from "@/lib/i18n";
import PasswordInput from "@/components/PasswordInput";

const strings: Record<string, Record<string, string>> = {
  en: {
    title: "Set New Password",
    subtitle: "Choose a new password for your account.",
    newPassword: "New password",
    confirmPassword: "Confirm password",
    submit: "Set Password",
    saving: "Saving...",
    invalidLink: "This reset link is invalid or has expired.",
    requestNew: "Request a new link",
  },
  nl: {
    title: "Nieuw Wachtwoord Instellen",
    subtitle: "Kies een nieuw wachtwoord voor je account.",
    newPassword: "Nieuw wachtwoord",
    confirmPassword: "Bevestig wachtwoord",
    submit: "Wachtwoord Instellen",
    saving: "Opslaan...",
    invalidLink: "Deze resetlink is ongeldig of verlopen.",
    requestNew: "Nieuwe link aanvragen",
  },
  fr: {
    title: "Définir un Nouveau Mot de Passe",
    subtitle: "Choisissez un nouveau mot de passe pour votre compte.",
    newPassword: "Nouveau mot de passe",
    confirmPassword: "Confirmer le mot de passe",
    submit: "Définir le Mot de Passe",
    saving: "Enregistrement...",
    invalidLink: "Ce lien de réinitialisation est invalide ou expiré.",
    requestNew: "Demander un nouveau lien",
  },
};

const inputClass =
  "mt-1 block w-full rounded-lg border border-green-700 bg-green-900 px-3 py-2 text-white placeholder-green-400 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500";

function ResetPasswordFormInner({ locale }: { locale: Locale }) {
  const s = strings[locale] || strings.en;
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [state, action, pending] = useActionState(resetPasswordWithToken, null);

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-green-950 px-6">
        <div className="w-full max-w-sm text-center">
          <h1 className="font-display text-2xl font-bold text-gold-200">
            {s.title}
          </h1>
          <p className="mt-4 text-sm text-red-400">{s.invalidLink}</p>
          <Link
            href="/forgot-password"
            className="mt-4 inline-block text-sm text-gold-200 hover:text-gold-300"
          >
            {s.requestNew}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-green-950 px-6">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-bold text-gold-200">
          {s.title}
        </h1>
        <p className="mt-2 text-sm text-green-100">{s.subtitle}</p>

        <form action={action} className="mt-6 space-y-4">
          <input type="hidden" name="token" value={token} />
          <div>
            <label className="block text-sm font-medium text-green-100">
              {s.newPassword}
            </label>
            <PasswordInput
              name="password"
              required
              minLength={8}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-green-100">
              {s.confirmPassword}
            </label>
            <PasswordInput
              name="confirmPassword"
              required
              minLength={8}
              className={inputClass}
            />
          </div>
          {state?.error && (
            <p className="text-sm text-red-400">{state.error}</p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-gold-600 px-4 py-2 text-sm font-medium text-white hover:bg-gold-500 disabled:opacity-50"
          >
            {pending ? s.saving : s.submit}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function ResetPasswordForm({ locale }: { locale: Locale }) {
  return (
    <Suspense>
      <ResetPasswordFormInner locale={locale} />
    </Suspense>
  );
}
