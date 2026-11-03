# Marble Run Studio

A playful, local-first marble-track builder. Snap pieces onto a board, release a marble, and let real two-dimensional gravity and collisions do the rest.

**Play:** https://gracebilliris.github.io/marble-run-studio/

## Your first minute

1. Press **Release marble** to try Golden cascade, the ready-made starter track.
2. Choose a straight rail, ramp, quarter curve, or spring bumper, then tap an empty grid cell.
3. Tap an existing piece to select it. **Rotate** changes its direction; the bin removes it.
4. Pause / resume to inspect a run. **Reset** returns the marble to its starting point. Editing also resets the run.
5. Aim for the green landing zone. Try the other two example tracks, or clear the board and build your own. **Undo** restores your previous edit.

Designs autosave in this browser on this device. No account, server, analytics, external assets, or network connection is needed after loading. If browser storage is unavailable, you can still play, but changes will not survive a reload.

**Keyboard:** Tab to the board; arrow keys move the cell cursor; Enter or Space places/selects. R rotates, Delete/Backspace removes, Escape deselects, and Ctrl/Cmd+Z undoes. Controls also work with touch.

## Run locally

Requires Node.js 22 and npm.

```sh
npm ci
npm run dev -- --port 5182 --strictPort
```

Open http://127.0.0.1:5182/. Build with `npm run build`; preview the production build with `npm run preview -- --port 5182 --strictPort` after stopping the dev server.

## Validation

```sh
npm test
npm run build
```

Unit tests exercise gravity, finite-segment/endpoint collisions, collision substeps, rail rotation, bumper restitution, all three natural winning tracks, escape detection, gap feedback, and strict design-save validation.

For browser checks, install Chromium once with `npx playwright install chromium`, start the local server above, and in another terminal run:

```sh
npm run test:browser
# Or check the published app:
BASE_URL=https://gracebilliris.github.io/marble-run-studio/ npm run test:browser
```

The browser check exercises desktop and touch editing, rotation, removal, undo, all example runs, pause/resume/reset, persistence and malformed-save recovery, keyboard controls, responsive widths, and browser errors. Screenshots go into ignored `artifacts/`.

## How the simulation works

This is an honest **2D** simulation with dimensional canvas styling, not a 3D rigid-body engine. A radius-9 marble accelerates downward under constant gravity. Rotated track pieces become finite line segments; quarter curves use twelve segments. Circle–segment contact resolves penetration, normal restitution, and tangential friction. Bumpers bounce more strongly. A fixed 120 Hz animation timestep is subdivided to at most 1/240 second, and long inactive-tab stalls are capped.

The marble wins only by physically touching the landing region and loses when it leaves the board. There is no scripted trajectory. Gap notices are advisory: free-fall jumps can be intentional. The spawn and landing zone are fixed by the chosen example; the track pieces are editable. A flat rail can leave the marble resting indefinitely—reset and add a slope when it needs a nudge.

## Deploy to GitHub Pages

The included workflow uses Node 22, runs `npm ci`, unit tests and the production build, then uploads `dist/` and deploys using the official Pages actions. Set the repository's **Settings → Pages → Source** to **GitHub Actions** and push to `main`. The workflow also supports manual dispatch.

Vite's `base: './'` keeps assets relative so the site works under `/marble-run-studio/`. No backend or secrets are required. The deployed address is https://gracebilliris.github.io/marble-run-studio/.
