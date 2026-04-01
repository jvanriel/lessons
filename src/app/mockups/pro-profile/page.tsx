import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  MapPin,
  Clock,
  Star,
  ChevronLeft,
  Users,
  Trophy,
  Calendar,
} from "lucide-react";

const pro = {
  name: "Olivier Philips",
  title: "PGA Professional",
  initials: "OP",
  bio: "Met meer dan 15 jaar ervaring help ik golfers van elk niveau hun spel te verbeteren. Mijn aanpak combineert technische analyse met video feedback en mentale coaching. Of je nu beginner bent of je handicap wil verlagen, samen werken we aan jouw doelen.",
  qualifications: ["PGA Belgium", "TPI Level 2", "TrackMan"],
  rating: 4.8,
  reviewCount: 124,
  lessonCount: 2340,
  locations: [
    { name: "Royal Waterloo Golf Club", address: "Vieux Chemin de Wavre 50, 1380 Lasne" },
    { name: "Golf de 7 Fontaines", address: "Chemin de Baudémont 21, 1420 Braine-l'Alleud" },
  ],
  lessonTypes: [
    { name: "Individuele les", duration: 30, price: 55, description: "Persoonlijke aandacht voor jouw specifieke verbeterpunten" },
    { name: "Individuele les", duration: 60, price: 95, description: "Uitgebreide sessie met video-analyse en oefenplan" },
    { name: "Groepsles", duration: 60, price: 35, maxParticipants: 4, description: "Leer samen met anderen in een ontspannen sfeer" },
    { name: "On-course les", duration: 90, price: 120, description: "Spel op de baan met tactisch advies en course management" },
  ],
  nextAvailable: "Morgen, 10:00",
};

export default function ProProfileMockup() {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-green-950 text-green-100/70">
        <div className="mx-auto max-w-4xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover:text-gold-200 transition-colors duration-200">
            <ChevronLeft className="h-4 w-4" />
            <span className="text-[13px] font-medium uppercase tracking-[0.1em]">Terug</span>
          </Link>
          <span className="font-display text-xl font-semibold text-gold-200">Golf Lessons</span>
          <div className="w-20" />
        </div>
      </header>

      {/* Hero */}
      <section className="bg-green-950 pb-16 pt-8">
        <div className="mx-auto max-w-4xl px-6">
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            <div className="h-28 w-28 rounded-full bg-green-800 border-2 border-gold-500/30 flex items-center justify-center shrink-0">
              <span className="font-display text-3xl font-semibold text-gold-300">{pro.initials}</span>
            </div>
            <div className="space-y-3">
              <div>
                <h1 className="font-display text-3xl font-semibold text-gold-50">{pro.name}</h1>
                <p className="text-green-100/60">{pro.title}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {pro.qualifications.map((q) => (
                  <span key={q} className="rounded-full bg-gold-500/15 px-3 py-1 text-xs font-medium text-gold-300">
                    {q}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-6 text-sm text-green-100/50">
                <span className="flex items-center gap-1.5">
                  <Star className="h-4 w-4 text-gold-400 fill-gold-400" />
                  <span className="text-gold-200 font-medium">{pro.rating}</span>
                  <span>({pro.reviewCount})</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Users className="h-4 w-4" />
                  {pro.lessonCount}+ lessen
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-4xl px-6 -mt-6 space-y-8 pb-16">
        {/* Quick book CTA */}
        <div className="rounded-xl border border-gold-300/50 bg-gold-50 p-5 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-gold-600" />
            <div>
              <p className="text-sm font-medium text-green-950">Eerstvolgende beschikbaarheid</p>
              <p className="text-sm text-green-700">{pro.nextAvailable}</p>
            </div>
          </div>
          <Button className="bg-gold-600 text-white hover:bg-gold-500 rounded-md px-5 py-2 font-medium shadow-none">
            Boek een les
          </Button>
        </div>

        {/* Bio */}
        <section className="space-y-3">
          <h2 className="font-display text-2xl font-semibold text-green-950">Over mij</h2>
          <p className="text-green-800/70 leading-relaxed">{pro.bio}</p>
        </section>

        <Separator className="bg-green-200" />

        {/* Lesson types */}
        <section className="space-y-4">
          <h2 className="font-display text-2xl font-semibold text-green-950">Lessen</h2>
          <div className="grid gap-3">
            {pro.lessonTypes.map((lesson, i) => (
              <div key={i} className="rounded-xl border border-green-200 bg-white p-5 flex items-center justify-between transition-colors hover:border-green-300">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-green-950">
                      {lesson.name}
                      <span className="text-green-600 font-normal"> — {lesson.duration} min</span>
                    </p>
                    {lesson.maxParticipants && (
                      <Badge variant="outline" className="text-[10px] border-green-300 text-green-600 bg-green-50">
                        max {lesson.maxParticipants}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-green-800/60">{lesson.description}</p>
                </div>
                <div className="text-right ml-6 shrink-0">
                  <p className="text-xl font-display font-semibold text-green-950">€{lesson.price}</p>
                  <button className="mt-1 text-[12px] font-medium text-gold-600 hover:text-gold-700 underline underline-offset-2 transition-colors">
                    Kies
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <Separator className="bg-green-200" />

        {/* Locations */}
        <section className="space-y-4">
          <h2 className="font-display text-2xl font-semibold text-green-950">Locaties</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {pro.locations.map((loc) => (
              <div key={loc.name} className="rounded-xl border border-green-200 bg-white p-5 space-y-3">
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-gold-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-sm text-green-950">{loc.name}</p>
                    <p className="text-xs text-green-800/60">{loc.address}</p>
                  </div>
                </div>
                <div className="h-32 rounded-lg bg-green-50 flex items-center justify-center border border-green-100">
                  <span className="text-xs text-green-400">Kaart</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <Separator className="bg-green-200" />

        {/* Stats */}
        <section className="grid grid-cols-3 gap-6 text-center py-4">
          <div>
            <Trophy className="h-5 w-5 text-gold-500 mx-auto mb-2" />
            <p className="font-display text-3xl font-semibold text-green-950">15+</p>
            <p className="text-xs text-green-600 mt-1">Jaar ervaring</p>
          </div>
          <div>
            <Users className="h-5 w-5 text-gold-500 mx-auto mb-2" />
            <p className="font-display text-3xl font-semibold text-green-950">{pro.lessonCount}+</p>
            <p className="text-xs text-green-600 mt-1">Lessen gegeven</p>
          </div>
          <div>
            <Clock className="h-5 w-5 text-gold-500 mx-auto mb-2" />
            <p className="font-display text-3xl font-semibold text-green-950">24u</p>
            <p className="text-xs text-green-600 mt-1">Reactietijd</p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-green-950 border-t border-gold-500/30 py-8">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <p className="font-display text-lg text-gold-200">Golf Lessons</p>
          <p className="text-xs text-green-100/40 mt-2">golflessons.be</p>
        </div>
      </footer>
    </div>
  );
}
