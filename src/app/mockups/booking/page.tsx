"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  Clock,
  CreditCard,
  Check,
} from "lucide-react";

const pro = {
  name: "Olivier Philips",
  initials: "OP",
  title: "PGA Professional",
};

const lessonTypes = [
  { id: "ind-30", name: "Individuele les", duration: 30, price: 55 },
  { id: "ind-60", name: "Individuele les", duration: 60, price: 95 },
  { id: "group-60", name: "Groepsles", duration: 60, price: 35 },
  { id: "oncourse-90", name: "On-course les", duration: 90, price: 120 },
];

const locations = [
  { id: "rwgc", name: "Royal Waterloo Golf Club" },
  { id: "7f", name: "Golf de 7 Fontaines" },
];

const days = [
  { date: "Ma 31 mrt", slots: ["09:00", "09:30", "10:00", "14:00", "14:30"] },
  { date: "Di 1 apr", slots: ["10:00", "10:30", "11:00", "15:00", "15:30", "16:00"] },
  { date: "Wo 2 apr", slots: ["09:00", "09:30", "13:00", "13:30", "14:00"] },
  { date: "Do 3 apr", slots: ["10:00", "10:30", "11:00", "11:30"] },
  { date: "Vr 4 apr", slots: ["09:00", "14:00", "14:30", "15:00", "15:30"] },
];

type Step = "type" | "location" | "time" | "confirm";
const steps: { key: Step; label: string }[] = [
  { key: "type", label: "Les" },
  { key: "location", label: "Locatie" },
  { key: "time", label: "Datum & tijd" },
  { key: "confirm", label: "Bevestig" },
];

export default function BookingMockup() {
  const [currentStep, setCurrentStep] = useState<Step>("type");
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<number>(0);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const stepIndex = steps.findIndex((s) => s.key === currentStep);
  const lessonType = lessonTypes.find((l) => l.id === selectedType);
  const location = locations.find((l) => l.id === selectedLocation);

  function next() {
    if (stepIndex < steps.length - 1) setCurrentStep(steps[stepIndex + 1].key);
  }
  function back() {
    if (stepIndex > 0) setCurrentStep(steps[stepIndex - 1].key);
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-green-950 text-green-100/70">
        <div className="mx-auto max-w-2xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover:text-gold-200 transition-colors duration-200">
            <ChevronLeft className="h-4 w-4" />
            <span className="text-[13px] font-medium uppercase tracking-[0.1em]">Terug</span>
          </Link>
          <span className="font-display text-xl font-semibold text-gold-200">Boek een les</span>
          <div className="w-20" />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-8 space-y-6">
        {/* Pro mini */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-green-800 flex items-center justify-center">
            <span className="font-display text-sm font-semibold text-gold-300">{pro.initials}</span>
          </div>
          <div>
            <p className="font-medium text-sm text-green-950">{pro.name}</p>
            <p className="text-xs text-green-600">{pro.title}</p>
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-1">
          {steps.map((step, i) => (
            <div key={step.key} className="flex items-center flex-1">
              <div className="flex items-center gap-2 flex-1">
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium shrink-0 transition-colors ${
                    i < stepIndex
                      ? "bg-green-700 text-white"
                      : i === stepIndex
                      ? "bg-gold-600 text-white"
                      : "bg-green-100 text-green-400"
                  }`}
                >
                  {i < stepIndex ? <Check className="h-4 w-4" /> : i + 1}
                </div>
                <span className={`text-xs hidden sm:block ${i === stepIndex ? "text-green-950 font-medium" : "text-green-400"}`}>
                  {step.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className={`h-px flex-1 mx-2 ${i < stepIndex ? "bg-green-600" : "bg-green-200"}`} />
              )}
            </div>
          ))}
        </div>

        <Separator className="bg-green-200" />

        {/* Step: Type */}
        {currentStep === "type" && (
          <div className="space-y-4">
            <h2 className="font-display text-2xl font-semibold text-green-950">Kies een type les</h2>
            <div className="grid gap-3">
              {lessonTypes.map((lesson) => (
                <button
                  key={lesson.id}
                  onClick={() => setSelectedType(lesson.id)}
                  className={`rounded-xl border p-5 text-left transition-colors flex items-center justify-between ${
                    selectedType === lesson.id
                      ? "border-gold-500 bg-gold-50"
                      : "border-green-200 bg-white hover:border-green-300"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                      selectedType === lesson.id ? "border-gold-600" : "border-green-300"
                    }`}>
                      {selectedType === lesson.id && <div className="h-2 w-2 rounded-full bg-gold-600" />}
                    </div>
                    <div>
                      <p className="font-medium text-sm text-green-950">{lesson.name}</p>
                      <p className="text-xs text-green-600 flex items-center gap-1 mt-0.5">
                        <Clock className="h-3 w-3" /> {lesson.duration} min
                      </p>
                    </div>
                  </div>
                  <p className="font-display text-lg font-semibold text-green-950">€{lesson.price}</p>
                </button>
              ))}
            </div>
            <div className="flex justify-end pt-2">
              <Button
                onClick={next}
                disabled={!selectedType}
                className="bg-gold-600 text-white hover:bg-gold-500 disabled:bg-green-200 disabled:text-green-400 rounded-md px-5"
              >
                Volgende <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Step: Location */}
        {currentStep === "location" && (
          <div className="space-y-4">
            <h2 className="font-display text-2xl font-semibold text-green-950">Kies een locatie</h2>
            <div className="grid gap-3">
              {locations.map((loc) => (
                <button
                  key={loc.id}
                  onClick={() => setSelectedLocation(loc.id)}
                  className={`rounded-xl border p-5 text-left transition-colors flex items-center gap-3 ${
                    selectedLocation === loc.id
                      ? "border-gold-500 bg-gold-50"
                      : "border-green-200 bg-white hover:border-green-300"
                  }`}
                >
                  <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    selectedLocation === loc.id ? "border-gold-600" : "border-green-300"
                  }`}>
                    {selectedLocation === loc.id && <div className="h-2 w-2 rounded-full bg-gold-600" />}
                  </div>
                  <MapPin className="h-4 w-4 text-green-400 shrink-0" />
                  <p className="font-medium text-sm text-green-950">{loc.name}</p>
                </button>
              ))}
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={back} className="border-green-200 text-green-700 hover:bg-green-50 rounded-md">
                <ChevronLeft className="h-4 w-4 mr-1" /> Terug
              </Button>
              <Button
                onClick={next}
                disabled={!selectedLocation}
                className="bg-gold-600 text-white hover:bg-gold-500 disabled:bg-green-200 disabled:text-green-400 rounded-md px-5"
              >
                Volgende <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Step: Time */}
        {currentStep === "time" && (
          <div className="space-y-4">
            <h2 className="font-display text-2xl font-semibold text-green-950">Kies datum & tijd</h2>

            <div className="flex gap-2 overflow-x-auto pb-2">
              {days.map((day, i) => (
                <button
                  key={day.date}
                  onClick={() => { setSelectedDay(i); setSelectedSlot(null); }}
                  className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
                    selectedDay === i
                      ? "bg-green-800 text-white"
                      : "bg-green-50 text-green-600 hover:bg-green-100"
                  }`}
                >
                  {day.date}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {days[selectedDay].slots.map((slot) => (
                <button
                  key={slot}
                  onClick={() => setSelectedSlot(slot)}
                  className={`py-3 rounded-lg text-sm font-mono font-medium transition-colors ${
                    selectedSlot === slot
                      ? "bg-gold-600 text-white"
                      : "bg-white border border-green-200 text-green-700 hover:border-green-300"
                  }`}
                >
                  {slot}
                </button>
              ))}
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={back} className="border-green-200 text-green-700 hover:bg-green-50 rounded-md">
                <ChevronLeft className="h-4 w-4 mr-1" /> Terug
              </Button>
              <Button
                onClick={next}
                disabled={!selectedSlot}
                className="bg-gold-600 text-white hover:bg-gold-500 disabled:bg-green-200 disabled:text-green-400 rounded-md px-5"
              >
                Volgende <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Step: Confirm */}
        {currentStep === "confirm" && (
          <div className="space-y-5">
            <h2 className="font-display text-2xl font-semibold text-green-950">Bevestig je boeking</h2>

            <div className="rounded-xl border border-green-200 bg-white p-6 space-y-4">
              <h3 className="font-display text-lg font-semibold text-green-950">Overzicht</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-green-600">Les</span>
                  <span className="font-medium text-green-950">{lessonType?.name} — {lessonType?.duration} min</span>
                </div>
                <Separator className="bg-green-100" />
                <div className="flex justify-between">
                  <span className="text-green-600">Locatie</span>
                  <span className="font-medium text-green-950">{location?.name}</span>
                </div>
                <Separator className="bg-green-100" />
                <div className="flex justify-between">
                  <span className="text-green-600">Datum & tijd</span>
                  <span className="font-medium text-green-950">{days[selectedDay].date}, {selectedSlot}</span>
                </div>
                <Separator className="bg-green-100" />
                <div className="flex justify-between">
                  <span className="text-green-600">Pro</span>
                  <span className="font-medium text-green-950">{pro.name}</span>
                </div>
                <Separator className="bg-green-200" />
                <div className="flex justify-between pt-1">
                  <span className="font-semibold text-green-950">Totaal</span>
                  <span className="font-display text-2xl font-bold text-gold-600">€{lessonType?.price}</span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-dashed border-green-300 bg-green-50 p-5 flex items-center gap-3">
              <CreditCard className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-sm font-medium text-green-950">Betaling via Stripe</p>
                <p className="text-xs text-green-600">Je wordt doorgestuurd naar een beveiligde betaalpagina</p>
              </div>
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={back} className="border-green-200 text-green-700 hover:bg-green-50 rounded-md">
                <ChevronLeft className="h-4 w-4 mr-1" /> Terug
              </Button>
              <Button
                size="lg"
                className="bg-gold-600 text-white hover:bg-gold-500 rounded-md px-6 font-medium"
              >
                Bevestig & Betaal — €{lessonType?.price}
              </Button>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-green-950 border-t border-gold-500/30 py-8 mt-16">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <p className="font-display text-lg text-gold-200">Golf Lessons</p>
          <p className="text-xs text-green-100/40 mt-2">golflessons.be</p>
        </div>
      </footer>
    </div>
  );
}
