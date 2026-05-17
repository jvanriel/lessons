"use client";

import { useState, useTransition } from "react";
import { updateProProfile, toggleProProfilePublished } from "./actions";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { t } from "@/lib/i18n/translations";
import type { Locale } from "@/lib/i18n";

interface ProfileData {
  id: number;
  displayName: string;
  bio: string | null;
  specialties: string | null;
  contactPhone: string | null;
  photoUrl: string | null;
  bookingEnabled: boolean;
  bookingNotice: number;
  bookingHorizon: number;
  cancellationHours: number;
  allowBookingWithoutPayment: boolean;
  published: boolean;
}

const inputClass =
  "block w-full rounded-lg border border-green-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500";

export default function ProProfileEditor({
  profile,
  locale,
}: {
  profile: ProfileData;
  locale: Locale;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [publishPending, startPublishTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleTogglePublish() {
    setError(null);
    setSaved(false);
    startPublishTransition(async () => {
      const result = await toggleProProfilePublished(!profile.published);
      if (result?.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  // Profile fields
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [specialties, setSpecialties] = useState(profile.specialties ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [contactPhone, setContactPhone] = useState(profile.contactPhone ?? "");

  // Photo upload
  const [photoUrl, setPhotoUrl] = useState(profile.photoUrl);
  const [photoPending, setPhotoPending] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoPending(true);
    setPhotoError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/pro/profile/upload-photo", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setPhotoUrl(data.url);
      router.refresh();
    } catch (err) {
      setPhotoError((err as Error).message);
    } finally {
      setPhotoPending(false);
    }
  }

  async function handlePhotoRemove() {
    setPhotoPending(true);
    setPhotoError(null);
    try {
      const res = await fetch("/api/pro/profile/upload-photo", {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Remove failed");
      }
      setPhotoUrl(null);
      router.refresh();
    } catch (err) {
      setPhotoError((err as Error).message);
    } finally {
      setPhotoPending(false);
    }
  }

  // Booking settings (task 130: durations + pricing + maxGroupSize
  // moved per-location; this editor no longer touches them).
  const [bookingEnabled, setBookingEnabled] = useState(profile.bookingEnabled);
  const [bookingNotice, setBookingNotice] = useState(profile.bookingNotice);
  const [bookingHorizon, setBookingHorizon] = useState(profile.bookingHorizon);
  const [cancellationHours, setCancellationHours] = useState(profile.cancellationHours);
  const [allowBookingWithoutPayment, setAllowBookingWithoutPayment] = useState(profile.allowBookingWithoutPayment);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("displayName", displayName);
      formData.set("specialties", specialties);
      formData.set("bio", bio);
      formData.set("contactPhone", contactPhone);
      formData.set("bookingEnabled", String(bookingEnabled));
      formData.set("bookingNotice", String(bookingNotice));
      formData.set("bookingHorizon", String(bookingHorizon));
      formData.set("cancellationHours", String(cancellationHours));
      formData.set("allowBookingWithoutPayment", String(allowBookingWithoutPayment));

      const result = await updateProProfile(null, formData);
      if (result?.error) setError(result.error);
      else setSaved(true);
    });
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              profile.published
                ? "bg-green-100 text-green-700"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            {profile.published ? t("proProfile.published", locale) : t("proProfile.draft", locale)}
          </span>
          <button
            type="button"
            onClick={handleTogglePublish}
            disabled={publishPending}
            className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
              profile.published
                ? "border-amber-300 bg-white text-amber-700 hover:bg-amber-50"
                : "border-green-600 bg-green-600 text-white hover:bg-green-500"
            }`}
          >
            {publishPending
              ? t("proProfile.publishSaving", locale)
              : profile.published
                ? t("proProfile.unpublish", locale)
                : t("proProfile.publish", locale)}
          </button>
          <p className="text-[11px] text-green-600/70">
            {profile.published
              ? t("proProfile.publishedHint", locale)
              : t("proProfile.draftHint", locale)}
          </p>
        </div>
        {profile.published && (
          <Link
            href={`/pros/${profile.id}`}
            className="text-xs text-gold-600 hover:text-gold-500"
            target="_blank"
          >
            {t("proProfile.viewPublic", locale)} &rarr;
          </Link>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* ── Profile Details ── */}
        <div className="space-y-4">
          <h2 className="font-display text-lg font-semibold text-green-950">
            {t("proProfile.section.profile", locale)}
          </h2>

          {/* Profile photo */}
          <div>
            <label className="block text-sm font-medium text-green-800">
              {t("proProfile.photo", locale)}
            </label>
            <div className="mt-2 flex items-center gap-4">
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoUrl}
                  alt=""
                  className="h-20 w-20 rounded-full object-cover ring-1 ring-green-200"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-2xl font-medium text-green-600">
                  {(displayName[0] || "?").toUpperCase()}
                </div>
              )}
              <div className="flex flex-col gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-green-300 bg-white px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50">
                  {photoPending
                    ? t("proProfile.photoUploading", locale)
                    : photoUrl
                      ? t("proProfile.photoReplace", locale)
                      : t("proProfile.photoUpload", locale)}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    disabled={photoPending}
                    onChange={handlePhotoChange}
                  />
                </label>
                {photoUrl && (
                  <button
                    type="button"
                    onClick={handlePhotoRemove}
                    disabled={photoPending}
                    className="text-xs text-red-500 hover:text-red-600 disabled:opacity-50"
                  >
                    {t("proProfile.photoRemove", locale)}
                  </button>
                )}
                <p className="text-[11px] text-green-500">
                  {t("proProfile.photoHint", locale)}
                </p>
              </div>
            </div>
            {photoError && (
              <p className="mt-2 text-xs text-red-600">{photoError}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-green-800">
              {t("proProfile.displayName", locale)}
            </label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-green-800">
              {t("proProfile.specialties", locale)}
            </label>
            <input
              value={specialties}
              onChange={(e) => setSpecialties(e.target.value)}
              placeholder={t("proProfile.specialtiesPlaceholder", locale)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-green-800">
              {t("proProfile.bio", locale)}
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={5}
              className={inputClass + " resize-none"}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-green-800">
              {t("proProfile.contactPhone", locale)}
            </label>
            <input
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder={t("proProfile.contactPhonePlaceholder", locale)}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-green-500">
              {t("proProfile.contactPhoneHelp", locale)}
            </p>
          </div>
        </div>

        {/* ── Booking Settings ── */}
        <div className="space-y-4 border-t border-green-100 pt-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-green-950">
              {t("proProfile.section.booking", locale)}
            </h2>
            <button
              type="button"
              role="switch"
              aria-checked={bookingEnabled}
              onClick={() => setBookingEnabled(!bookingEnabled)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                bookingEnabled ? "bg-gold-600" : "bg-gray-300"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  bookingEnabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
          {!bookingEnabled && (
            <p className="text-sm text-amber-600">
              {t("proProfile.bookingsDisabled", locale)}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-green-800">
                {t("proProfile.bookingNotice", locale)}
              </label>
              <input
                type="number"
                value={bookingNotice}
                onChange={(e) => setBookingNotice(Number(e.target.value))}
                className={inputClass + " max-w-[120px]"}
                min={0}
                max={168}
              />
              <p className="mt-1 text-xs text-green-500">
                {t("proProfile.bookingNoticeHelp", locale)}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-green-800">
                {t("proProfile.bookingHorizon", locale)}
              </label>
              <input
                type="number"
                value={bookingHorizon}
                onChange={(e) => setBookingHorizon(Number(e.target.value))}
                className={inputClass + " max-w-[120px]"}
                min={1}
                max={365}
              />
              <p className="mt-1 text-xs text-green-500">
                {t("proProfile.bookingHorizonHelp", locale)}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-green-800">
                {t("proProfile.cancellationWindow", locale)}
              </label>
              <input
                type="number"
                value={cancellationHours}
                onChange={(e) => setCancellationHours(Number(e.target.value))}
                className={inputClass + " max-w-[120px]"}
                min={0}
                max={168}
              />
              <p className="mt-1 text-xs text-green-500">
                {t("proProfile.cancellationWindowHelp", locale)}
              </p>
            </div>
          </div>

          {/* Allow booking without payment */}
          <div className="flex items-start gap-4 rounded-lg border border-green-100 bg-green-50/50 p-4">
            <div className="flex-1">
              <p className="text-sm font-medium text-green-800">
                {t("proProfile.allowNoPayment", locale)}
              </p>
              <p className="mt-1 text-xs text-green-500">
                {t("proProfile.allowNoPaymentHelp", locale)}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={allowBookingWithoutPayment}
              onClick={() =>
                setAllowBookingWithoutPayment(!allowBookingWithoutPayment)
              }
              className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                allowBookingWithoutPayment ? "bg-gold-600" : "bg-gray-300"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  allowBookingWithoutPayment
                    ? "translate-x-5"
                    : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        {/* ── Actions ── */}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && <p className="text-sm text-green-700">{t("proProfile.saved", locale)}</p>}

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-green-800 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {pending ? t("proProfile.saving", locale) : t("proProfile.save", locale)}
        </button>
      </form>
    </div>
  );
}
