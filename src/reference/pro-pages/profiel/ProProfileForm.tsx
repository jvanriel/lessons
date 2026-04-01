"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { updateProBio, addProLocation, updateProLocation, removeProLocation, deactivateProLocationFromDate } from "./actions";

interface Location {
  id: number;
  name: string;
  city: string | null;
}

interface ProLocation {
  id: number;
  locationId: number;
  priceIndication: string | null;
  notes: string | null;
  active: boolean;
  locationName: string;
  locationCity: string | null;
}

interface ProProfileFormProps {
  profile: {
    id: number;
    slug: string;
    photoUrl: string | null;
    lessonDurations: number[];
    maxGroupSize: number;
    priceIndication: string | null;
    bookingEnabled: boolean;
    bookingNotice: number;
    bookingHorizon: number;
    cancellationHours: number;
    createdAt: string;
  };
  userName: string;
  userEmail: string;
  allLocations: Location[];
  myLocations: ProLocation[];
}

export default function ProProfileForm({
  profile,
  userName,
  userEmail,
  allLocations,
  myLocations: initialMyLocations,
}: ProProfileFormProps) {
  const [pending, startTransition] = useTransition();
  const [priceIndication, setPriceIndication] = useState(profile.priceIndication || "");
  const [lessonDurations, setLessonDurations] = useState<number[]>(profile.lessonDurations);
  const [maxGroupSize, setMaxGroupSize] = useState(profile.maxGroupSize);
  const [bookingNotice, setBookingNotice] = useState(profile.bookingNotice);
  const [bookingHorizon, setBookingHorizon] = useState(profile.bookingHorizon);
  const [cancellationHours, setCancellationHours] = useState(profile.cancellationHours);
  const [bookingEnabled, setBookingEnabled] = useState(profile.bookingEnabled);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [myLocations, setMyLocations] = useState(initialMyLocations);
  const [addingLocation, setAddingLocation] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState<number | "">("");
  const [locationError, setLocationError] = useState<string | null>(null);

  const linkedLocationIds = new Set(myLocations.map((l) => l.locationId));
  const availableLocations = allLocations.filter((l) => !linkedLocationIds.has(l.id));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    startTransition(async () => {
      const result = await updateProBio({
        profileId: profile.id,
        priceIndication: priceIndication || null,
        lessonDurations,
        maxGroupSize,
        bookingNotice,
        bookingHorizon,
        cancellationHours,
        bookingEnabled,
      });
      if (result.error) {
        setError(result.error);
      } else {
        setError(null);
        setSaved(true);
      }
    });
  }

  function handleAddLocation() {
    if (!selectedLocationId) return;
    setLocationError(null);
    startTransition(async () => {
      const result = await addProLocation({
        profileId: profile.id,
        locationId: Number(selectedLocationId),
      });
      if (result.error) {
        setLocationError(result.error);
      } else {
        const loc = allLocations.find((l) => l.id === Number(selectedLocationId));
        setMyLocations((prev) => [
          ...prev,
          {
            id: Date.now(), // temporary, will be replaced on reload
            locationId: Number(selectedLocationId),
            priceIndication: null,
            notes: null,
            active: true,
            locationName: loc?.name ?? "Onbekend",
            locationCity: loc?.city ?? null,
          },
        ]);
        setSelectedLocationId("");
        setAddingLocation(false);
      }
    });
  }

  const [removeDialog, setRemoveDialog] = useState<{ proLocationId: number; name: string } | null>(null);
  const [deactivateDate, setDeactivateDate] = useState("");

  function handleRemoveLocation(proLocationId: number) {
    startTransition(async () => {
      await removeProLocation({ proLocationId, profileId: profile.id });
      setMyLocations((prev) => prev.filter((l) => l.id !== proLocationId));
      setRemoveDialog(null);
    });
  }

  function handleDeactivateFromDate(proLocationId: number) {
    if (!deactivateDate) return;
    startTransition(async () => {
      await deactivateProLocationFromDate({ proLocationId, profileId: profile.id, fromDate: deactivateDate });
      setMyLocations((prev) =>
        prev.map((l) => (l.id === proLocationId ? { ...l, active: false } : l)),
      );
      setRemoveDialog(null);
      setDeactivateDate("");
    });
  }

  function handleToggleActive(proLocationId: number, active: boolean) {
    startTransition(async () => {
      await updateProLocation({ proLocationId, profileId: profile.id, active });
      setMyLocations((prev) =>
        prev.map((l) => (l.id === proLocationId ? { ...l, active } : l)),
      );
    });
  }

  const inputClass =
    "mt-1 block w-full rounded-lg border border-green-200 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500";

  return (
    <div className="mt-8 space-y-6">
      {/* Read-only info */}
      <div className="rounded-xl border border-green-200 bg-white p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-green-700/50">Naam</p>
            <p className="mt-0.5 text-sm text-green-950">{userName}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-green-700/50">E-mail</p>
            <p className="mt-0.5 text-sm text-green-950">{userEmail}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-green-700/50">Profiel URL</p>
            <p className="mt-0.5 text-sm text-gold-700">/lessen/{profile.slug}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-green-700/50">Status</p>
            <button
              type="button"
              onClick={() => setBookingEnabled(!bookingEnabled)}
              className={`mt-0.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
                bookingEnabled
                  ? "bg-green-100 text-green-700 hover:bg-green-200"
                  : "bg-red-100 text-red-700 hover:bg-red-200"
              }`}
            >
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  bookingEnabled ? "bg-green-500" : "bg-red-400"
                }`}
              />
              {bookingEnabled ? "Boekingen actief" : "Boekingen uitgeschakeld"}
            </button>
          </div>
        </div>
      </div>

      {/* Locations */}
      <div className="rounded-xl border border-green-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-green-950">Leslocaties</h2>
            <p className="mt-0.5 text-xs text-green-700/50">
              Voeg minstens één locatie toe om lessen aan te bieden.
              Staat je golfbaan er niet bij? <Link href="/pro/locaties" className="text-gold-600 underline hover:text-gold-500">Voeg deze eerst toe via Locaties</Link>.
            </p>
          </div>
          {!addingLocation && availableLocations.length > 0 && (
            <button
              type="button"
              onClick={() => setAddingLocation(true)}
              className="rounded-lg bg-gold-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-gold-500"
            >
              + Locatie toevoegen
            </button>
          )}
        </div>

        {locationError && <p className="mt-2 text-sm text-red-600">{locationError}</p>}

        {addingLocation && (
          <div className="mt-4 flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-sm font-medium text-green-900">Locatie</label>
              <select
                value={selectedLocationId}
                onChange={(e) => setSelectedLocationId(e.target.value ? Number(e.target.value) : "")}
                className={inputClass}
              >
                <option value="">Kies een locatie...</option>
                {availableLocations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}{l.city ? ` — ${l.city}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleAddLocation}
              disabled={!selectedLocationId || pending}
              className="rounded-lg bg-gold-600 px-3 py-2 text-sm font-medium text-white hover:bg-gold-500 disabled:opacity-50"
            >
              Toevoegen
            </button>
            <button
              type="button"
              onClick={() => { setAddingLocation(false); setSelectedLocationId(""); }}
              className="rounded-lg border border-green-200 px-3 py-2 text-sm text-green-700 hover:bg-green-50"
            >
              Annuleer
            </button>
          </div>
        )}

        {myLocations.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-4 py-6 text-center">
            <p className="text-sm text-amber-800">
              Je hebt nog geen locaties gekoppeld. Voeg minstens één locatie toe om lessen aan te bieden.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {myLocations.map((loc) => (
              <div
                key={loc.id}
                className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                  loc.active
                    ? "border-green-200 bg-green-50/50"
                    : "border-green-200/50 bg-gray-50 opacity-60"
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-green-950">{loc.locationName}</p>
                  {loc.locationCity && (
                    <p className="text-xs text-green-700/60">{loc.locationCity}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleActive(loc.id, !loc.active)}
                    disabled={pending}
                    className={`rounded px-2 py-1 text-xs font-medium ${
                      loc.active
                        ? "bg-green-100 text-green-700 hover:bg-green-200"
                        : "bg-gray-200 text-gray-600 hover:bg-gray-300"
                    }`}
                    title={loc.active ? "Deactiveer" : "Activeer"}
                  >
                    {loc.active ? "Actief" : "Inactief"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemoveDialog({ proLocationId: loc.id, name: loc.locationName })}
                    disabled={pending}
                    className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    Verwijder
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Remove location dialog */}
        {removeDialog && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50/50 p-5">
            <h4 className="text-sm font-semibold text-red-900">
              {removeDialog.name} verwijderen?
            </h4>
            <p className="mt-1 text-sm text-red-800/70">
              Als je deze locatie verwijdert, worden ook alle beschikbaarheidsslots gewist.
            </p>

            <div className="mt-4 space-y-3">
              <div className="rounded-lg border border-green-200 bg-white p-3">
                <label className="flex items-center gap-2 text-sm font-medium text-green-900">
                  Deactiveer vanaf een datum
                </label>
                <p className="mt-0.5 text-xs text-green-700/60">
                  De locatie wordt inactief en beschikbaarheid eindigt op de gekozen datum.
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="date"
                    value={deactivateDate}
                    onChange={(e) => setDeactivateDate(e.target.value)}
                    className="rounded-lg border border-green-200 px-3 py-1.5 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleDeactivateFromDate(removeDialog.proLocationId)}
                    disabled={!deactivateDate || pending}
                    className="rounded-lg bg-gold-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-gold-500 disabled:opacity-50"
                  >
                    Deactiveer
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleRemoveLocation(removeDialog.proLocationId)}
                  disabled={pending}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Volledig verwijderen
                </button>
                <button
                  type="button"
                  onClick={() => { setRemoveDialog(null); setDeactivateDate(""); }}
                  className="rounded-lg border border-green-200 px-3 py-1.5 text-sm text-green-700 hover:bg-green-50"
                >
                  Annuleren
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Editable profile fields */}
      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-xl border border-green-200 bg-white p-6"
      >
        <h2 className="font-display text-lg font-semibold text-green-950">
          Lesinstellingen
        </h2>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && <p className="text-sm text-green-600">Profiel bijgewerkt.</p>}

        <div>
          <label className="block text-sm font-medium text-green-900">Prijsindicatie</label>
          <input
            value={priceIndication}
            onChange={(e) => setPriceIndication(e.target.value)}
            className={inputClass}
            placeholder="€75 per uur"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-green-900">Lesduuropties</label>
          <div className="mt-1 flex flex-wrap gap-3">
            {[30, 60, 90, 120].map((d) => (
              <label key={d} className="flex items-center gap-1.5 text-sm text-green-950">
                <input
                  type="checkbox"
                  checked={lessonDurations.includes(d)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setLessonDurations([...lessonDurations, d].sort((a, b) => a - b));
                    } else {
                      const next = lessonDurations.filter((v) => v !== d);
                      if (next.length > 0) setLessonDurations(next);
                    }
                  }}
                  className="rounded border-green-300"
                />
                {d} min
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-green-700/50">
            Selecteer welke lesduuropties je wilt aanbieden.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-green-900">Max groepsgrootte</label>
          <input
            type="number"
            value={maxGroupSize}
            onChange={(e) => setMaxGroupSize(Number(e.target.value))}
            className="mt-1 block w-32 rounded-lg border border-green-200 px-3 py-2 text-sm"
            min={1}
            max={10}
          />
          <p className="mt-1 text-xs text-green-700/50">
            Maximaal aantal deelnemers per les.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-sm font-medium text-green-900">Boekingstermijn (uren vooraf)</label>
            <input
              type="number"
              value={bookingNotice}
              onChange={(e) => setBookingNotice(Number(e.target.value))}
              className="mt-1 block w-32 rounded-lg border border-green-200 px-3 py-2 text-sm"
              min={0}
              max={168}
            />
            <p className="mt-1 text-xs text-green-700/50">
              Hoeveel uur van tevoren moet een les geboekt worden.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-green-900">Boekingshorizon (dagen)</label>
            <input
              type="number"
              value={bookingHorizon}
              onChange={(e) => setBookingHorizon(Number(e.target.value))}
              className="mt-1 block w-32 rounded-lg border border-green-200 px-3 py-2 text-sm"
              min={1}
              max={365}
            />
            <p className="mt-1 text-xs text-green-700/50">
              Hoeveel dagen vooruit een les geboekt kan worden.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-green-900">Annuleringstermijn (uren)</label>
            <input
              type="number"
              value={cancellationHours}
              onChange={(e) => setCancellationHours(Number(e.target.value))}
              className="mt-1 block w-32 rounded-lg border border-green-200 px-3 py-2 text-sm"
              min={0}
              max={168}
            />
            <p className="mt-1 text-xs text-green-700/50">
              Tot hoeveel uur voor aanvang een lid kan annuleren.
            </p>
          </div>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-gold-600 px-4 py-2 text-sm font-medium text-white hover:bg-gold-500 disabled:opacity-50"
        >
          {pending ? "Opslaan..." : "Opslaan"}
        </button>
      </form>
    </div>
  );
}
