# demo-generator

A self-contained pipeline that turns a web app repo into a demo-video factory.
Playwright drives the app, MiniMax narrates, ffmpeg assembles, and every render
lands in a versioned archive.

**Never set up before? Read [1ST_TIME_SETUP.md](1ST_TIME_SETUP.md) and run it
yourself — do not hand the user a list of commands.**

**Already set up? The operating instructions are in
[skills/demo-video/SKILL.md](skills/demo-video/SKILL.md).**

## Orientation

```
docs/SOP.md            the phase order and the gate at each phase — follow it
docs/APP-CONTRACT.md   the five things an app must provide
docs/KNOWN-ISSUES.md   traps already paid for; check here when something fails
renders/NAMING.md      archive layout and naming rules
scripts/setup.mjs      one-command bootstrap for a fresh machine
scripts/collect-render.mjs   harvest a run into the archive
templates/             flow scaffolding + drop-in app-contract files
vendor/argo/           the patched video engine (MIT, see vendor/argo/LICENSE)
renders/               all generated output, gitignored
```

## Five rules

1. **Never skip SOP Phase 1.** Walk the flow and screenshot every screen before
   writing narration. Narration written from source describes screens that are
   not on display; the render still succeeds and nothing catches it.
2. **Never render against production.** Check `baseURL` and the app's database
   target before starting. If only production exists, stop and ask.
3. **Demo mode is presentation-only.** Never let it change what the app computes.
4. **Prove the app is unchanged without the flag.** Lazily inject; diff, don't assert.
5. **`overflowMs` must be zero** before a video ships.

## Credentials

`MINIMAX_API_KEY` comes from the environment. Never commit it, and never write
credential-store paths or credential-reading code into this package or into an
app repo — these directories get copied and shared.
