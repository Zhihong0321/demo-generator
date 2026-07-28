# First-time setup — instructions for the AI

**You are the one running this setup.** Do not hand the user a list of commands
to run. Execute them yourself, check each result, and only report back when the
pipeline is proven working or genuinely blocked.

Expect this to take 5–15 minutes, most of it a one-time browser download.

---

## Rules before you start

**Ask the user for the MiniMax API key. Once, directly.**
Do not search their credential stores, environment, password manager, or shell
history for it. Do not write it into any file in this package — set it in the
environment for the session only. If they don't have one, that is a hard block;
say so and stop.

**Never claim setup succeeded until Step 4 passes.** A green `setup.mjs` proves
the install; it does not prove the pipeline produces video. Those are different
claims and the second one is the one that matters.

**Do not skip verification steps because the previous one passed.** Every check
here exists because something failed silently in a way that only surfaced later.

**If a step fails, consult the Failure playbook at the bottom before improvising.**
Most failures here are already understood and have a specific fix.

---

## Step 0 — Preflight

Run these and read the output. Do not proceed past a failure.

```bash
node --version
ffmpeg -version
ffprobe -version
df -h .
```

| Check | Requirement | If it fails |
|---|---|---|
| Node | ≥ 18 | Tell the user to install Node 20 LTS or newer. Hard block. |
| ffmpeg + ffprobe | on PATH | See install commands below. Hard block. |
| **Free disk** | **≥ 2 GB on this drive** | **Hard block — tell the user before installing anything.** |

Installing ffmpeg:

```bash
winget install Gyan.FFmpeg      # Windows
brew install ffmpeg             # macOS
sudo apt install ffmpeg         # Debian / Ubuntu
```

The disk check is not a formality. The install writes to this drive, and the
Playwright browser download writes ~700 MB to your user cache directory. Setup
has previously filled a small drive to 100% and left a broken half-install.

---

## Step 1 — Get the API key

Ask the user:

> I need a MiniMax API key to generate the narration. Paste it here and I'll set
> it for this session only — I won't write it to any file.

Then export it in the shell you will use for every later step:

```bash
export MINIMAX_API_KEY='sk-...'          # bash / zsh
$env:MINIMAX_API_KEY = 'sk-...'          # PowerShell
```

Verify it is a real key before spending time on the install — this call costs a
fraction of a cent and takes two seconds:

```bash
node -e "
fetch('https://api.minimax.io/v1/t2a_v2',{method:'POST',
  headers:{Authorization:'Bearer '+process.env.MINIMAX_API_KEY,'Content-Type':'application/json'},
  body:JSON.stringify({model:'speech-02-hd',text:'setup check',stream:false,output_format:'hex',
    voice_setting:{voice_id:'English_expressive_narrator',speed:1,vol:1,pitch:0},
    audio_setting:{sample_rate:32000,bitrate:128000,format:'mp3',channel:1}})})
 .then(r=>r.json()).then(j=>console.log('status:',JSON.stringify(j.base_resp),'| audio chars:',j.data?.audio?.length??0))
"
```

**Expect `status: {"status_code":0,"status_msg":"success"}` and a non-zero audio
length.** MiniMax returns HTTP 200 even for failures, so `status_code` is the
only signal that means anything. Anything else: report the exact `status_msg` to
the user and stop — a bad key wastes the whole install.

---

## Step 2 — Install and build

```bash
node scripts/setup.mjs
```

This installs dependencies, builds the engine, downloads Chromium, and verifies
the MiniMax engine registered. It exits non-zero with a specific reason on
failure. Read that reason; do not retry blindly.

**Expect the run to end with `SETUP OK`.** If it doesn't, go to the Failure
playbook.

The Chromium download is ~700 MB and cached globally, so it is a one-time cost
per machine, not per project.

---

## Step 3 — Verify the install

```bash
node -e "import('./vendor/argo/dist/tts/engines/index.js').then(m=>console.log(Object.keys(m.engines).join(', ')))"
```

**Expect `minimax` in the list.** If it is missing, the build did not pick up the
engine and nothing later will work.

---

## Step 4 — Prove the pipeline actually renders

This is the step that matters. Everything before it only proves files exist.

```bash
node scripts/smoke-test.mjs
```

It serves a self-contained page from `smoke/public`, renders a ~13 second
narrated video against it, asserts the output has both a video and an audio
stream, then deletes the output. No app, no database, no fixture required.

**Expect `SMOKE TEST PASSED`** with a duration around 13 s and a non-zero size.

Add `--keep` if you want to inspect the video rather than have it cleaned up.

**Do not report success to the user before this passes.**

---

## Step 5 — Report

Tell the user, in this order:

1. Setup is complete and the smoke test passed — give the duration and size.
2. Anything that needed a workaround or is still degraded.
3. The next action: read `docs/SOP.md` and start at Phase 0 — and that **SOP
   Phase 1 must not be skipped**, because narration written from source code
   rather than from screenshots produces videos that are confidently wrong and
   pass every automated check.

Then ask which repo and which flow they want to film first.

Do not dump the whole SOP at them. Do not offer a menu of options.

---

## Failure playbook

| Symptom | Cause | Fix |
|---|---|---|
| `spawn npm ENOENT` / `spawn EINVAL` | `npm`/`npx` are `.cmd` shims on Windows that `execFile` cannot spawn | Already fixed in `setup.mjs`. If it appears in your own script, run the tool's `*-cli.js` under `process.execPath`. |
| `ENOSPC: no space left on device` | Drive filled mid-install | Delete `vendor/argo/node_modules`, free space, restart from Step 0. Never leave a half-install in place. |
| `Cannot find module '@huggingface/transformers'` | An optional dependency is being loaded eagerly | Should not happen — it is fixed. If it does, that import needs to become lazy. Do **not** install the package; it is over 1 GB. |
| `Playwright recording failed:` with an empty body | A subprocess failed to spawn; argo only collects stdout/stderr, both empty | It is a spawn failure, not a silent success. See `docs/KNOWN-ISSUES.md`. |
| All scenes report success, then `No screencast recording found` | The demo never called `await narration.startRecording(page)` | Add it before the first `narration.mark()`. Argo's own `demos/mobile.demo.ts` is stale and omits it — never copy that file. |
| `page.goto: net::ERR_ABORTED` against your own local server | The server's event loop is blocked by a synchronous child process | Use async `spawn`, not `execFileSync`, when serving from the same process. |
| `No overlay found for scene "x"` | `showOverlay()` needs an `overlay` block in `<flow>.scenes.json` | Add one, or drop the `showOverlay` call — narration-only scenes are normal. |
| `base_resp.status_code` is non-zero | MiniMax rejected the request, despite HTTP 200 | Report `status_msg` verbatim. Usually an invalid key or exhausted quota. |
| Video renders but `overflowMs` > 0 | Narration is longer than the recording; the final frame is frozen | Not a setup failure. Fix scene pacing with `narration.durationFor(scene)` before shipping the video. |

---

## Definition of done

```
[ ] node >= 18, ffmpeg and ffprobe on PATH, >= 2 GB free
[ ] MINIMAX_API_KEY exported, and a live call returned status_code 0
[ ] scripts/setup.mjs ended with SETUP OK
[ ] the engine registry lists `minimax`
[ ] scripts/smoke-test.mjs ended with SMOKE TEST PASSED
[ ] the key was never written to a file
```

All six, or setup is not done. Say which one failed rather than reporting
partial success as success.
