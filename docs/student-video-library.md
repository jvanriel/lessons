# Student Video Library — design plan

> Feature: a personal video library per student, where the pro can post
> videos and optionally replace the original audio with a commentary
> track recorded in-app.
>
> Status: planning. Nothing built yet.

## 1. User stories

**Pro**
- Open a student's coaching page → go to "Videos" tab → upload a file or
  record a quick one with the device camera.
- Pick an existing video from the student's library and re-record the
  audio: watch the video, talk over it, hit stop, save. The app muxes
  the new audio in place of the original.
- Trim or re-do the recording before saving.
- See status per video: draft / published / seen by student.

**Student**
- Open their own "Videos" tab → see all videos their pro has posted,
  newest first, with the pro's voice-over if one exists.
- Tap to play full-screen, comment/react (optional, parks with the
  chat feature).

## 2. Reference in `surveys/telmio`

Telmio's `apps/console/src/demo/editor/` does a much more elaborate
version: transcribe → translate → re-voice → assemble → render.
Relevant bits to steal:

| Telmio file | Why it's useful |
|-------------|-----------------|
| `DemoRecorder.tsx` | getUserMedia + MediaRecorder pattern for tab+mic, with live VU meter, device picker, preview before commit. We need only mic + countdown over video — simpler. |
| `editor/useFFmpeg.ts` | Loading ffmpeg.wasm from CDN (`@ffmpeg/core@0.12.10` ESM build), COOP/COEP note, `extractAudio` / `mixAudioTracks` / `renderFinalVideo` helpers, `generateThumbnails`. `renderFinalVideo` is the muxer we want: `-c:v copy`, swap `-c:a libvorbis` for AAC/MP4 in our case. |
| `editor/stages/AssembleStage.tsx` | WaveSurfer timeline patterns — nice polish if we add segmented voice-over later. |
| `editor/useIndexedDB.ts` | Local-first editor state so large blobs survive reloads without uploading anything half-baked. |
| `vite.config.ts` + `vercel.json` | `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` headers required for `SharedArrayBuffer` (ffmpeg.wasm). We'll need the same on our Next.js config. |

What we don't need from telmio (at least for v1): Whisper
transcription, translation, TTS voice generation, per-segment
assembly. All the "make a new narration" work we're doing is literally
the pro recording over the video — no AI pipeline needed.

## 3. Data model

New table `coaching_videos`:

```ts
export const coachingVideos = pgTable("coaching_videos", {
  id: serial("id").primaryKey(),
  proStudentId: integer("pro_student_id")
    .references(() => proStudents.id, { onDelete: "cascade" })
    .notNull(),
  // Who posted it. Usually the pro; leave room for "student uploaded
  // themselves" later.
  postedById: integer("posted_by_id")
    .references(() => users.id)
    .notNull(),
  // Original file (pre voice-over). Optional — if the pro only recorded
  // themselves we just use this as the final.
  sourceUrl: varchar("source_url", { length: 500 }),
  sourceDurationMs: integer("source_duration_ms"),
  // Current playable version. Either the source, or the muxed output
  // after a voice-over.
  finalUrl: varchar("final_url", { length: 500 }).notNull(),
  finalDurationMs: integer("final_duration_ms").notNull(),
  // Flat "the pro's voice-over track alone" blob, kept so the pro can
  // re-mux without re-recording.
  voiceoverUrl: varchar("voiceover_url", { length: 500 }),
  thumbnailUrl: varchar("thumbnail_url", { length: 500 }),
  title: varchar("title", { length: 200 }),
  notes: text("notes"),
  seenByStudentAt: timestamp("seen_by_student_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

Storage: Vercel Blob under `coaching/<proStudentId>/<videoId>/source.mp4`
/ `.../voiceover.webm` / `.../final.mp4` / `.../thumb.jpg`. Same pattern
as the existing `/api/coaching/upload` route we already have.

## 4. UX flow

### 4a. Upload a video

Straightforward path, ship first:

1. Pro opens `/pro/students/<id>/videos` → "Add video" button.
2. Picks a file (mp4/mov/webm, ≤100 MB). Native `<input type=file>`.
3. Client computes duration from `<video metadata>`, writes to Blob via
   a new `/api/coaching/videos/upload` route (mirrors `coaching/upload`
   but larger size cap + video-only MIME filter).
4. Row inserted into `coaching_videos` with `sourceUrl` =
   `finalUrl`. Thumbnail generated client-side via `<canvas>`
   `drawImage` at `duration/2` and uploaded alongside.
5. Notification fires to the student via the existing push system.

Alternative record-now path uses the same flow with a short
`MediaRecorder` wrapper, same end state.

### 4b. Record voice-over

This is the interesting part. Three stages, all client-side:

1. **Record** — pro watches the video full-screen with their mic armed.
   `<video>` plays, `MediaRecorder` captures mic (Opus in webm).
   Timer + VU meter on top of the video. Recording starts/stops with
   the video's play/pause so the two tracks stay in lockstep.
2. **Preview** — scrub the video with the recorded audio playing
   instead of the original. Two `<audio>` tags synced off the video's
   `timeupdate` event (simpler than actually muxing for preview).
3. **Save** — mux in the browser with ffmpeg.wasm
   (`-i source.mp4 -i voiceover.webm -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 -shortest out.mp4`),
   upload the muxed `out.mp4` as `finalUrl`, and the raw `.webm` as
   `voiceoverUrl` for re-mux later.

### 4c. Student view

Tab in `/member/coaching/[id]/`, list of videos with thumbnail + title
+ pro's notes, tap to open a full-screen player. First view of each
video writes `seenByStudentAt` so the pro sees a "seen" dot.

## 5. Technical approach

**ffmpeg.wasm**
- Same CDN load trick as telmio: `@ffmpeg/core@0.12.10` ESM,
  `toBlobURL` the core+wasm, `ffmpeg.load({ coreURL, wasmURL })`.
- **Next.js 16 needs COOP/COEP headers** to unlock
  `SharedArrayBuffer`. In `next.config.ts`, add a `headers()` entry
  for `/pro/**` that sets `Cross-Origin-Opener-Policy: same-origin` +
  `Cross-Origin-Embedder-Policy: require-corp`. Scope to the pro app
  — the public site doesn't need it and COEP can break third-party
  embeds.
- Render happens in the browser so we never round-trip the source
  through a server. Output is the only upload.

**Recording UX**
- Lean on `MediaRecorder({ mimeType: "audio/webm;codecs=opus" })`.
  Fallback to `audio/mp4` for iOS Safari.
- Use `video.requestVideoFrameCallback()` for the sync between video
  playback and audio start, so drift is sub-frame even if the pro
  scrubs during recording (v2 feature).

**Storage**
- Reuse the Blob upload pattern from `coaching/upload/route.ts`.
- Thumbnail captured as a 320px wide JPEG at `duration/2` via
  `<canvas>.toBlob()` — small and free, no ffmpeg needed.
- Consider `@vercel/blob`'s `uploadPart` / multipart for files >32 MB
  (Vercel free tier limit per PUT). telmio sticks to a single PUT
  because their files are audio-sized; ours will be larger.

**Progressive upload**
- For ≤50 MB, plain `POST` is fine.
- For bigger, write to Blob with `upload()` from the browser using a
  client token minted by a small server route (`@vercel/blob`
  `generateClientTokenFromReadWriteToken`). Telmio doesn't do this —
  we'll need it because golf lesson videos can easily be 80 MB.

**Playback**
- `<video>` element, no HLS. Vercel Blob serves raw mp4 with range
  requests — good enough for ≤5 minute clips which is the expected
  length.

## 6. Phased rollout

| Phase | Scope | Notes |
|-------|-------|-------|
| 1 | Upload + basic library (pro posts, student watches) | Ship first. No voice-over, no in-browser recording yet. Validates storage, permissions, notifications. |
| 2 | In-browser record via `MediaRecorder` | "Record with your camera" button that stores as source. Cheap once upload is working. |
| 3 | Voice-over: record, preview, render (one-take) | Flagship. Needs COOP/COEP + ffmpeg.wasm. Retake = record again (simpler than timeline trim). |
| 4 | Share / react / threaded comments | Integrate with existing coaching chat. |

Per-segment voice-over with a WaveSurfer timeline is **off the
roadmap** — Jan's explicit call. Revisit only if the one-take UX
turns out to not cover the actual use case.

## 7. Decisions & open questions

**Decided**

- **Voice-over interaction: one long take** (2026-04-22, Jan).
  Watch-the-video-and-talk-over-it, hit stop, save. No timeline UI,
  no WaveSurfer, no per-segment workflow in v1. That keeps Phase 3
  to ~2 days and avoids the telmio-shaped complexity.

**Still open**

1. **Size cap.** What's the longest video a pro will post? Jan said
   "rather small" — if that means <50 MB / ~2 min, plain single-PUT
   upload is fine and we skip the multipart complexity. Need a
   number to code the limit against.
2. **Student uploads.** Should the student also be able to post
   their own practice clips? Data model leaves the door open via
   `postedById`.
3. **Keep the original?** When a voice-over replaces audio, do we
   keep the original playable as a toggle ("hear my voice" / "hear
   original")? Keeping both doubles storage. Cheapest answer: keep
   `sourceUrl` so the pro can re-mux, but only expose the
   `finalUrl` to the student.
4. **Retention.** Videos live forever, or rotate after N months?
   Relevant for Blob billing once the library fills up.

## 8. Estimated effort (rough)

- Phase 1 (upload + library): 1 day.
- Phase 2 (in-browser record): 0.5 day.
- Phase 3 (one-take voice-over with ffmpeg.wasm): ~2 days — the
  Next.js 16 COOP/COEP headers and scoping them to the pro side
  without breaking embeds elsewhere is the trickiest part.
- Phase 4 (share / react): 1–2 days, optional.

Total first three phases: ~3.5 days of focused work.
