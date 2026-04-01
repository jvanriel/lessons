"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  ChevronLeft,
  Send,
  Image as ImageIcon,
  Video,
  FileText,
  Target,
  CheckCircle2,
  MessageCircle,
} from "lucide-react";

const student = { name: "Sophie De Wilde", initials: "SD" };
const pro = { name: "Olivier Philips", initials: "OP" };

type Comment = { author: "pro" | "student"; text: string; time: string };
type Entry = {
  id: number;
  type: "note" | "photo" | "video" | "drill" | "lesson_summary";
  title: string;
  content: string;
  media?: string;
  date: string;
  comments: Comment[];
};

const entries: Entry[] = [
  {
    id: 1,
    type: "lesson_summary",
    title: "Les 28 maart — Driving & Long Game",
    content: "Vandaag hebben we gewerkt aan je driver swing. De belangrijkste aandachtspunten:\n\n• Je backswing is nu veel beter op vlak, goed werk!\n• Probeer je heuprotatie eerder in te zetten bij de downswing\n• Houd je linkerarm gestrekt tot na impact\n\nJe afstand is met ~15m toegenomen ten opzichte van vorige maand.",
    date: "28 mrt 2026",
    comments: [
      { author: "student", text: "Bedankt Marc! Ik voelde ook echt verschil vandaag. Moet ik de oefening elke dag doen?", time: "18:30" },
      { author: "pro", text: "3-4 keer per week is voldoende. Focus op kwaliteit, niet kwantiteit. 15 minuten per sessie is genoeg.", time: "19:15" },
      { author: "student", text: "Top, doe ik! 👍", time: "19:20" },
    ],
  },
  {
    id: 2,
    type: "drill",
    title: "Oefening: Heuprotatie Drill",
    content: "Doe deze oefening zonder bal:\n\n1. Neem je setup positie\n2. Kruis je armen over je borst\n3. Maak een backswing enkel met je bovenlichaam\n4. Start de downswing met je heupen — voel hoe je heupen vóór je schouders draaien\n5. Herhaal 20x\n\nDan met bal: focus op hetzelfde gevoel. Gebruik een 7-iron.",
    date: "28 mrt 2026",
    comments: [],
  },
  {
    id: 3,
    type: "photo",
    title: "Swing vergelijking — Februari vs Maart",
    content: "Links: 14 feb. Rechts: 28 mrt. Kijk naar de verbetering in je swing plane en je positie aan de top. Je linkerelleboog is nu veel rechter.",
    media: "photo",
    date: "28 mrt 2026",
    comments: [
      { author: "student", text: "Wow, het verschil is echt duidelijk! Ik had niet door dat het zo veel veranderd was.", time: "20:10" },
    ],
  },
  {
    id: 4,
    type: "note",
    title: "Tip: Pre-shot routine",
    content: "Sophie, probeer deze pre-shot routine voor elke slag:\n\n1. Sta achter de bal, kies je doellijn\n2. Eén oefenswing naast de bal\n3. Adres de bal, kijk naar het doel, kijk terug naar de bal\n4. Swing binnen 5 seconden\n\nDit helpt tegen overthinking op de baan.",
    date: "21 mrt 2026",
    comments: [
      { author: "student", text: "Ik heb dit gisteren geprobeerd op de baan. Het hielp echt om sneller te beslissen!", time: "14:20" },
      { author: "pro", text: "Mooi! Hoe ging het scoren?", time: "15:45" },
      { author: "student", text: "42 op 9 holes, mijn beste score dit jaar 😊", time: "16:00" },
      { author: "pro", text: "Fantastisch! Dat is echte vooruitgang. Blijf zo doorgaan!", time: "16:05" },
    ],
  },
  {
    id: 5,
    type: "video",
    title: "Video: Chip & Run techniek",
    content: "Hier is de techniek die we vorige week hebben besproken voor chips rond de green. Let op de handpositie: handen altijd vóór de bal.",
    media: "video",
    date: "14 mrt 2026",
    comments: [],
  },
];

const typeIcon: Record<string, typeof FileText> = {
  note: FileText, photo: ImageIcon, video: Video, drill: Target, lesson_summary: CheckCircle2,
};
const typeLabel: Record<string, string> = {
  note: "Tip", photo: "Foto", video: "Video", drill: "Oefening", lesson_summary: "Lesverslag",
};

function CommentThread({ entry }: { entry: Entry }) {
  const [replyText, setReplyText] = useState("");
  const [showReply, setShowReply] = useState(false);

  return (
    <div className="space-y-2">
      {entry.comments.length > 0 && (
        <div className="space-y-2 pl-3 border-l-2 border-green-200">
          {entry.comments.map((comment, i) => {
            const isPro = comment.author === "pro";
            return (
              <div key={i} className="flex gap-2">
                <div className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                  isPro ? "bg-green-800" : "bg-green-100"
                }`}>
                  <span className={`text-[9px] font-semibold ${isPro ? "text-gold-300" : "text-green-600"}`}>
                    {isPro ? pro.initials : student.initials}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`inline-block rounded-xl px-3 py-2 text-sm max-w-full ${
                    isPro ? "bg-green-50 text-green-900" : "bg-gold-50 text-green-900"
                  }`}>
                    <p className="whitespace-pre-wrap break-words">{comment.text}</p>
                  </div>
                  <p className="text-[10px] text-green-400 mt-0.5 px-1">{comment.time}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showReply ? (
        <div className="flex gap-2 items-end pl-3">
          <Textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Schrijf een reactie..."
            className="min-h-[40px] max-h-[120px] text-sm resize-none border-green-200 bg-white focus:border-green-500 focus:ring-green-500 rounded-lg"
            rows={1}
          />
          <button className="shrink-0 h-10 w-10 rounded-lg bg-gold-600 text-white hover:bg-gold-500 transition-colors flex items-center justify-center">
            <Send className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowReply(true)}
          className="flex items-center gap-1.5 text-xs text-green-500 hover:text-green-700 transition-colors pl-3"
        >
          <MessageCircle className="h-3 w-3" />
          {entry.comments.length > 0 ? "Reageer" : "Schrijf een reactie..."}
        </button>
      )}
    </div>
  );
}

export default function StudentPageMockup() {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-green-950 text-green-100/70 sticky top-0 z-10">
        <div className="mx-auto max-w-2xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover:text-gold-200 transition-colors duration-200">
            <ChevronLeft className="h-4 w-4" />
            <span className="text-[13px] font-medium uppercase tracking-[0.1em]">Terug</span>
          </Link>
          <span className="font-display text-xl font-semibold text-gold-200">Mijn pagina</span>
          <div className="w-20" />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-8 space-y-6">
        {/* Student + Pro header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
              <span className="font-display text-lg font-semibold text-green-700">{student.initials}</span>
            </div>
            <div>
              <p className="font-semibold text-green-950">{student.name}</p>
              <p className="text-xs text-green-600">Student</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-green-600">
            <span>Coach:</span>
            <div className="h-7 w-7 rounded-full bg-green-800 flex items-center justify-center">
              <span className="text-[9px] font-semibold text-gold-300">{pro.initials}</span>
            </div>
            <span className="font-medium text-green-950">{pro.name}</span>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { value: "12", label: "Lessen" },
            { value: "42", label: "Beste 9h" },
            { value: "+15m", label: "Drive", accent: true },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-green-200 bg-white p-4 text-center">
              <p className={`font-display text-2xl font-semibold ${stat.accent ? "text-gold-600" : "text-green-950"}`}>
                {stat.value}
              </p>
              <p className="text-[10px] text-green-500 uppercase tracking-wider mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        <Separator className="bg-green-200" />

        {/* Timeline */}
        <div className="space-y-4">
          {entries.map((entry) => {
            const Icon = typeIcon[entry.type];
            return (
              <div key={entry.id} className="rounded-xl border border-green-200 bg-white p-5 space-y-3">
                {/* Entry header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-8 w-8 rounded-lg bg-green-50 border border-green-100 flex items-center justify-center shrink-0">
                      <Icon className="h-4 w-4 text-green-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-green-950 truncate">{entry.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="rounded-full bg-gold-100 px-2 py-0.5 text-[10px] font-medium text-gold-700">
                          {typeLabel[entry.type]}
                        </span>
                        <span className="text-[10px] text-green-400">{entry.date}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Media placeholder */}
                {entry.media === "photo" && (
                  <div className="h-48 rounded-lg bg-green-50 flex items-center justify-center border border-green-100">
                    <div className="text-center text-green-400">
                      <ImageIcon className="h-8 w-8 mx-auto mb-1 opacity-50" />
                      <p className="text-xs">Swing vergelijking</p>
                    </div>
                  </div>
                )}
                {entry.media === "video" && (
                  <div className="h-48 rounded-lg bg-green-50 flex items-center justify-center border border-green-100 relative">
                    <div className="text-center text-green-400">
                      <Video className="h-8 w-8 mx-auto mb-1 opacity-50" />
                      <p className="text-xs">Video fragment</p>
                    </div>
                    <Badge className="absolute bottom-2 right-2 bg-green-800 text-green-100 text-[10px]">0:45</Badge>
                  </div>
                )}

                {/* Content */}
                <p className="text-sm text-green-800/70 whitespace-pre-line leading-relaxed">
                  {entry.content}
                </p>

                {/* Comments */}
                <Separator className="bg-green-100" />
                <CommentThread entry={entry} />
              </div>
            );
          })}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-green-950 border-t border-gold-500/30 py-8 mt-8">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <p className="font-display text-lg text-gold-200">Golf Lessons</p>
          <p className="text-xs text-green-100/40 mt-2">golflessons.be</p>
        </div>
      </footer>
    </div>
  );
}
