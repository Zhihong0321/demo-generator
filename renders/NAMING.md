# Render archive — layout and naming

Every generated artifact lands here. Nothing generated is written anywhere else,
and nothing here is ever overwritten except `published/`.

## Layout

```
renders/
  <app>/                                  solar-calculator-v2
    <flow>/                               mobile-solar-proposal
      <run-id>/                           20260728-1233__mobile-390x694__en__app-e4cf7d3
        video.mp4                         the deliverable
        narration.wav                     full aligned narration track
        captions.srt / captions.vtt       burned-in and soft caption sources
        chapters.txt                      chapter markers
        contact-sheet.png                 every 2s as one image, for fast review
        scene-report.json                 argo's timing report
        render.json                       full provenance — read this first
        audio/01-intro.wav                per-scene narration, in scene order
        thumbs/01-intro.jpg               per-scene thumbnail, in scene order
        frames/frame-0012s.png            sampled frames, named by timestamp
      latest.json                         pointer to the newest run
    published/
      <app>__<flow>__<viewport>__<lang>.mp4    stable name, safe to share
```

## Run id

```
20260728-1233__mobile-390x694__en__app-e4cf7d3
└─ when      └─ viewport     └─ lang └─ app commit
```

| Field | Meaning | Why it's in the name |
|---|---|---|
| `YYYYMMDD-HHMM` | local time of collection | lexical sort == chronological sort |
| `<form>-<W>x<H>` | `mobile` / `tablet` / `desktop` + exact pixels | the same flow ships at several viewports |
| lang | `en`, `ms`, `zh` | the same flow ships in several languages |
| `app-<sha>` | short git SHA of the **app repo**, not the pipeline | tells you if the video is stale |

`app-nosha` means `--app-repo` wasn't passed, so staleness can't be determined.

## Naming rules

These apply to every file and directory in the archive:

- ASCII, lowercase, kebab-case.
- `__` separates fields. `-` joins words inside a field. Never mix them up —
  splitting on `__` must always yield exactly the fields above.
- Ordered sets are zero-padded and prefixed with their index: `01-intro.wav`,
  not `intro.wav`. Scene order is not alphabetical.
- Sampled frames are named by their timestamp in the video (`frame-0012s.png`),
  because that is what you search by when a reviewer says "12 seconds in".
- No spaces, parentheses, or non-ASCII anywhere.

## Two tiers, on purpose

**Run directories are immutable.** Every render gets its own, keyed by time and
commit. You can always answer "what did this look like three deploys ago".

**`published/` is mutable and stable.** One file per app+flow+viewport+lang,
overwritten when you approve a new render. This is the name you paste into a
message or embed in a page — it never changes, so links never rot.

A render is only published when you pass `--publish`. Collecting is automatic;
publishing is a decision.

## Collecting a run

```bash
node scripts/collect-render.mjs \
  --demo solar-proposal \
  --app solar-calculator-v2 \
  --flow mobile-solar-proposal \
  --lang en \
  --app-repo "E:/Solar Calculator v2" \
  --publish
```

`--demo` is argo's internal name. `--app` and `--flow` are what the archive is
organised by, so they should read like documentation, not like code.
