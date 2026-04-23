"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { updateProfile, changePassword, updateEmailPreference, updateLocalePreference, sendVerificationEmail } from "./actions";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n/translations";
import { LOCALE_LABELS, DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

function PasswordInput({
  name,
  required,
  minLength,
  value,
  onChange,
}: {
  name: string;
  required?: boolean;
  minLength?: number;
  value: string;
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        name={name}
        type={visible ? "text" : "password"}
        required={required}
        minLength={minLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass + " pr-10"}
      />
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-green-800/40 hover:text-green-800/70"
        tabIndex={-1}
      >
        {visible ? (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
          </svg>
        ) : (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
        )}
      </button>
    </div>
  );
}

interface ProfileUser {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  emailOptOut: boolean;
  preferredLocale: string | null;
  emailVerifiedAt: string | null;
}

function EmailPreferences({
  defaultOptOut,
  locale,
}: {
  defaultOptOut: boolean;
  locale: Locale;
}) {
  const [optOut, setOptOut] = useState(defaultOptOut);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  function handleToggle() {
    const newValue = !optOut;
    setOptOut(newValue);
    setMessage(null);
    startTransition(async () => {
      const result = await updateEmailPreference(newValue);
      if (result.error) {
        setOptOut(!newValue);
        setMessage({ type: "error", text: result.error });
      } else {
        setMessage({
          type: "success",
          text: newValue
            ? t("profile.emailsDisabled", locale)
            : t("profile.emailsEnabled", locale),
        });
      }
    });
  }

  return (
    <div>
      <h2 className="font-display text-xl font-semibold text-green-950">
        {t("profile.emailPreferences", locale)}
      </h2>
      <div className="mt-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-green-800">
            {t("profile.receiveEmails", locale)}
          </p>
          <p className="mt-1 text-sm text-green-700/60">
            {t("profile.receiveEmailsDesc", locale)}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={!optOut}
          disabled={isPending}
          onClick={handleToggle}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-gold-500 focus:ring-offset-2 disabled:opacity-50 ${
            !optOut ? "bg-green-800" : "bg-green-300"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform duration-200 ${
              !optOut ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>
      {message && (
        <p
          className={`mt-3 text-sm ${
            message.type === "error" ? "text-red-600" : "text-green-700"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}

function LocalePreference({
  defaultLocale,
  locale: uiLocale,
}: {
  defaultLocale: string;
  locale: Locale;
}) {
  const [currentLocale, setCurrentLocale] = useState(defaultLocale);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const router = useRouter();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newLocale = e.target.value;
    setCurrentLocale(newLocale);
    setMessage(null);
    startTransition(async () => {
      const result = await updateLocalePreference(newLocale);
      if (result.error) {
        setCurrentLocale(currentLocale);
        setMessage({ type: "error", text: result.error });
      } else {
        document.cookie = `locale=${newLocale};path=/;max-age=${365 * 24 * 60 * 60};samesite=lax`;
        setMessage({ type: "success", text: t("profile.localeSaved", newLocale as Locale) });
        router.refresh();
      }
    });
  }

  return (
    <div>
      <h2 className="font-display text-xl font-semibold text-green-950">
        {t("profile.localeTitle", uiLocale)}
      </h2>
      <div className="mt-6">
        <p className="mb-3 text-sm text-green-700/60">
          {t("profile.localeDesc", uiLocale)}
        </p>
        <select
          value={currentLocale}
          onChange={handleChange}
          disabled={isPending}
          className="block w-full max-w-xs rounded-lg border border-green-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
        >
          {(Object.entries(LOCALE_LABELS) as [Locale, string][]).map(
            ([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            )
          )}
        </select>
      </div>
      {message && (
        <p
          className={`mt-3 text-sm ${
            message.type === "error" ? "text-red-600" : "text-green-700"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}

function VerificationBanner({ locale }: { locale: Locale }) {
  const [isPending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleResend() {
    setError(null);
    setSent(false);
    startTransition(async () => {
      const result = await sendVerificationEmail();
      if (result.error) {
        setError(result.error);
      } else {
        setSent(true);
      }
    });
  }

  return (
    <div className="rounded-lg border border-gold-300/50 bg-gold-100 px-5 py-4">
      <p className="text-sm font-medium text-green-900">
        {t("profile.emailNotVerified", locale)}
      </p>
      <p className="mt-1 text-sm text-green-700/60">
        {t("profile.checkInbox", locale)}
      </p>
      <div className="mt-3">
        {sent ? (
          <p className="text-sm text-green-700">{t("profile.verificationSent", locale)}</p>
        ) : (
          <button
            onClick={handleResend}
            disabled={isPending}
            className="rounded-md bg-gold-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gold-500 disabled:opacity-50"
          >
            {isPending ? t("profile.sending", locale) : t("profile.resendVerification", locale)}
          </button>
        )}
        {error && (
          <p className="mt-1 text-xs text-red-600">{error}</p>
        )}
      </div>
    </div>
  );
}

const inputClass =
  "block w-full rounded-lg border border-green-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500";

export default function ProfileForm({
  user,
  locale,
}: {
  user: ProfileUser;
  locale: Locale;
}) {
  const [profileState, profileAction, profilePending] = useActionState(
    updateProfile,
    null
  );

  return (
    <div className="space-y-12">
      {/* Email verification banner */}
      {!user.emailVerifiedAt && (
        <VerificationBanner locale={locale} />
      )}

      {/* Profile details */}
      <div>
        <h2 className="font-display text-xl font-semibold text-green-950">
          {t("profile.details", locale)}
        </h2>
        <form action={profileAction} className="mt-6 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-green-800">
                {t("profile.firstName", locale)}
              </label>
              <input
                name="firstName"
                required
                defaultValue={user.firstName}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-green-800">
                {t("profile.lastName", locale)}
              </label>
              <input
                name="lastName"
                required
                defaultValue={user.lastName}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-green-800">
                {t("profile.email", locale)}
              </label>
              <input
                name="email"
                type="email"
                required
                defaultValue={user.email}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-green-800">
                {t("profile.phone", locale)}
              </label>
              <input
                name="phone"
                defaultValue={user.phone ?? ""}
                className={inputClass}
              />
            </div>
          </div>

          {profileState?.error && (
            <p className="text-sm text-red-600">{profileState.error}</p>
          )}
          {profileState?.success && (
            <p className="text-sm text-green-700">{t("profile.saved", locale)}</p>
          )}

          <button
            type="submit"
            disabled={profilePending}
            className="rounded-lg bg-green-800 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {profilePending
              ? t("profile.saving", locale)
              : t("profile.save", locale)}
          </button>
        </form>
      </div>

      {/* Email preferences */}
      <EmailPreferences defaultOptOut={user.emailOptOut} locale={locale} />

      {/* Locale preference */}
      <LocalePreference
        defaultLocale={user.preferredLocale || DEFAULT_LOCALE}
        locale={locale}
      />

    </div>
  );
}

function generatePassword(): string {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%";
  let pw = "";
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  for (let i = 0; i < 16; i++) pw += chars[arr[i] % chars.length];
  return pw;
}

export function ChangePasswordForm({ locale }: { locale: Locale }) {
  const [passwordState, passwordAction, passwordPending] = useActionState(
    changePassword,
    null
  );

  const passwordFormRef = useRef<HTMLFormElement>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showGenerated, setShowGenerated] = useState(false);
  const [copied, setCopied] = useState(false);

  const passwordMismatch =
    !newPassword || !confirmPassword || newPassword !== confirmPassword;

  useEffect(() => {
    if (passwordState?.success) {
      passwordFormRef.current?.reset();
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowGenerated(false);
    }
  }, [passwordState]);

  function handleGenerate() {
    const pw = generatePassword();
    setNewPassword(pw);
    setConfirmPassword(pw);
    setShowGenerated(true);
    setCopied(false);
  }

  function handleCopy() {
    navigator.clipboard.writeText(newPassword).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div>
      <h2 className="font-display text-xl font-semibold text-green-950">
        {t("profile.changePassword", locale)}
      </h2>
      <form
        ref={passwordFormRef}
        action={passwordAction}
        className="mt-6 space-y-5"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-green-800">
              {t("profile.currentPassword", locale)}
            </label>
            <PasswordInput
              name="currentPassword"
              required
              value={currentPassword}
              onChange={setCurrentPassword}
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-green-800">
                {t("profile.newPassword", locale)}
              </label>
              <button
                type="button"
                onClick={handleGenerate}
                className="text-xs font-medium text-gold-600 hover:text-gold-500"
              >
                {t("onboarding.generatePassword", locale)}
              </button>
            </div>
            <div className="relative">
              <input
                name="newPassword"
                type={showGenerated ? "text" : "password"}
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setShowGenerated(false); }}
                className={inputClass + " pr-20"}
              />
              <div className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
                {newPassword && (
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="text-green-800/40 hover:text-green-800/70"
                    tabIndex={-1}
                    title={copied ? t("onboarding.copied", locale) : t("onboarding.copyPassword", locale)}
                  >
                    {copied ? (
                      <svg className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                      </svg>
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowGenerated(!showGenerated)}
                  className="text-green-800/40 hover:text-green-800/70"
                  tabIndex={-1}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    {showGenerated ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                    ) : (
                      <>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                      </>
                    )}
                  </svg>
                </button>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-green-800">
              {t("profile.confirmPassword", locale)}
            </label>
            <PasswordInput
              name="confirmPassword"
              required
              minLength={8}
              value={confirmPassword}
              onChange={setConfirmPassword}
            />
          </div>
        </div>

        {passwordState?.error && (
          <p className="text-sm text-red-600">{passwordState.error}</p>
        )}
        {passwordState?.success && (
          <p className="text-sm text-green-700">
            {t("profile.passwordChanged", locale)}
          </p>
        )}

        <button
          type="submit"
          disabled={passwordPending || passwordMismatch}
          className="rounded-lg bg-green-800 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {passwordPending
            ? t("profile.saving", locale)
            : t("profile.changePasswordBtn", locale)}
        </button>
      </form>
    </div>
  );
}
