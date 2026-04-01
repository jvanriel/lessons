"use client";

import { useState, useActionState, useTransition } from "react";
import {
  createLocation,
  updateProLocation,
  removeProLocation,
} from "./actions";

interface ProLocation {
  proLocationId: number;
  locationId: number;
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  priceIndication: string | null;
  notes: string | null;
  sortOrder: number;
  active: boolean;
}

const inputClass =
  "block w-full rounded-lg border border-green-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500";

export default function LocationManager({
  locations,
}: {
  locations: ProLocation[];
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [createState, createAction, createPending] = useActionState(
    async (
      prev: { error?: string; success?: boolean } | null,
      formData: FormData
    ) => {
      const result = await createLocation(prev, formData);
      if (result.success) setShowAdd(false);
      return result;
    },
    null
  );
  const [, startTransition] = useTransition();

  function handleRemove(proLocationId: number, name: string) {
    if (!confirm(`Remove ${name} from your locations?`)) return;
    startTransition(() => {
      removeProLocation(proLocationId);
    });
  }

  return (
    <div className="mt-8 space-y-4">
      {/* Location list */}
      {locations.length === 0 ? (
        <div className="rounded-xl border border-green-200 bg-white p-8 text-center text-sm text-green-500">
          No locations yet. Add your first teaching location below.
        </div>
      ) : (
        locations.map((loc) => (
          <div
            key={loc.proLocationId}
            className={`rounded-xl border bg-white p-5 ${
              loc.active
                ? "border-green-200"
                : "border-amber-200 bg-amber-50/30"
            }`}
          >
            {editingId === loc.proLocationId ? (
              <EditLocationForm
                location={loc}
                onClose={() => setEditingId(null)}
              />
            ) : (
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-green-900">{loc.name}</h3>
                    {!loc.active && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                        Inactive
                      </span>
                    )}
                  </div>
                  {(loc.address || loc.city) && (
                    <p className="mt-0.5 text-sm text-green-600">
                      {[loc.address, loc.city, loc.country]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  )}
                  {loc.priceIndication && (
                    <p className="mt-1 text-xs text-gold-600">
                      {loc.priceIndication}
                    </p>
                  )}
                  {loc.notes && (
                    <p className="mt-1 text-xs text-green-500">{loc.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditingId(loc.proLocationId)}
                    className="rounded p-1.5 text-green-500 hover:bg-green-100 hover:text-green-700"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
                    </svg>
                  </button>
                  <button
                    onClick={() =>
                      handleRemove(loc.proLocationId, loc.name)
                    }
                    className="rounded p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        ))
      )}

      {/* Add location */}
      {showAdd ? (
        <div className="rounded-xl border border-gold-300 bg-white p-5">
          <h3 className="mb-4 font-medium text-green-900">Add Location</h3>
          <form action={createAction} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-green-700">
                  Name *
                </label>
                <input
                  name="name"
                  required
                  placeholder="e.g. Kempense Golf"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-green-700">
                  City
                </label>
                <input name="city" placeholder="e.g. Mol" className={inputClass} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-green-700">
                  Address
                </label>
                <input
                  name="address"
                  placeholder="Street and number"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-green-700">
                  Country
                </label>
                <input
                  name="country"
                  defaultValue="Belgium"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-green-700">
                  Price indication
                </label>
                <input
                  name="priceIndication"
                  placeholder="e.g. €75/h"
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-green-700">
                  Notes (internal)
                </label>
                <input name="notes" className={inputClass} />
              </div>
            </div>
            {createState?.error && (
              <p className="text-sm text-red-600">{createState.error}</p>
            )}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={createPending}
                className="rounded-lg bg-gold-600 px-4 py-2 text-sm font-medium text-white hover:bg-gold-500 disabled:opacity-50"
              >
                {createPending ? "Adding..." : "Add Location"}
              </button>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="rounded-lg border border-green-200 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-green-300 bg-white px-4 py-4 text-sm font-medium text-green-600 transition-colors hover:border-gold-400 hover:text-gold-600"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add a teaching location
        </button>
      )}
    </div>
  );
}

function EditLocationForm({
  location,
  onClose,
}: {
  location: ProLocation;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(
    async (
      prev: { error?: string; success?: boolean } | null,
      formData: FormData
    ) => {
      const result = await updateProLocation(prev, formData);
      if (result.success) onClose();
      return result;
    },
    null
  );
  const [active, setActive] = useState(location.active);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="proLocationId" value={location.proLocationId} />
      <input type="hidden" name="active" value={String(active)} />
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-green-900">{location.name}</h3>
        <label className="flex items-center gap-2 text-sm text-green-700">
          <button
            type="button"
            role="switch"
            aria-checked={active}
            onClick={() => setActive(!active)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
              active ? "bg-green-600" : "bg-green-300"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                active ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
          Active
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-green-700">
            Price indication
          </label>
          <input
            name="priceIndication"
            defaultValue={location.priceIndication ?? ""}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-green-700">
            Notes
          </label>
          <input
            name="notes"
            defaultValue={location.notes ?? ""}
            className={inputClass}
          />
        </div>
      </div>
      {state?.error && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
        >
          {pending ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-green-200 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
