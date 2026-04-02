"use client";

import { useActionState } from "react";
import { requestPasswordReset } from "./actions";
import Link from "next/link";
import type { Locale } from "@/lib/i18n";

const strings: Record<string, Record<string, string>> = {
  en: {
    title: "Forgot Password",
    subtitle: "Enter your email and we'll send you a link to reset your password.",
    email: "Email",
    submit: "Send Reset Link",
    sending: "Sending...",
    success: "If an account exists with this email, you'll receive a reset link shortly.",
    backToLogin: "Back to login",
  },
  nl: {
    title: "Wachtwoord Vergeten",
    subtitle: "Voer je e-mailadres in en we sturen je een link om je wachtwoord te resetten.",
    email: "E-mail",
    submit: "Resetlink Versturen",
    sending: "Versturen...",
    success: "Als er een account bestaat met dit e-mailadres, ontvang je binnenkort een resetlink.",
    backToLogin: "Terug naar inloggen",
  },
  fr: {
    title: "Mot de Passe Oublié",
    subtitle: "Entrez votre adresse e-mail et nous vous enverrons un lien pour réinitialiser votre mot de passe.",
    email: "E-mail",
    submit: "Envoyer le Lien",
    sending: "Envoi...",
    success: "Si un compte existe avec cette adresse e-mail, vous recevrez un lien de réinitialisation sous peu.",
    backToLogin: "Retour à la connexion",
  },
};

export default function ForgotPasswordForm({ locale }: { locale: Locale }) {
  const s = strings[locale] || strings.en;
  const [state, action, pending] = useActionState(requestPasswordReset, null);

  return (
    <div className="flex min-h-screen items-center justify-center bg-green-950 px-6">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-bold text-gold-200">
          {s.title}
        </h1>
        <p className="mt-2 text-sm text-green-100">
          {s.subtitle}
        </p>

        {state?.success ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-lg border border-green-600/30 bg-green-900/50 px-4 py-3 text-sm text-green-100">
              {s.success}
            </div>
            <Link
              href="/login"
              className="block text-center text-sm text-gold-200 hover:text-gold-300"
            >
              {s.backToLogin}
            </Link>
          </div>
        ) : (
          <form action={action} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-green-100"
              >
                {s.email}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoFocus
                className="mt-1 block w-full rounded-lg border border-green-700 bg-green-900 px-3 py-2 text-white placeholder-green-400 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
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
              {pending ? s.sending : s.submit}
            </button>
            <Link
              href="/login"
              className="block text-center text-sm text-green-100/60 hover:text-green-100"
            >
              {s.backToLogin}
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
