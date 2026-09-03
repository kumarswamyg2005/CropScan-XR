# XR test plan

Run manually per release. There is no automated headset testing — an automated
suite cannot tell you that a panel makes someone nauseous.

Primary device: **Quest 3 Browser**. Development: desktop Chrome with the
Immersive Web Emulator.

Record the date, build SHA and device. A failed line blocks the release.

---

## 1. Entry

- [ ] `/field?scan=<id>` loads that diagnosis, that Grad-CAM, that cycle
- [ ] `/field` with no scan enters browse mode and offers diseases that have a cycle
- [ ] An **uncertain** scan cannot enter. The button is disabled and states why
- [ ] A scan whose disease has no cycle is blocked with a *different* reason
- [ ] With no headset, the scene still runs with orbit controls
- [ ] "Enter in VR" is disabled, not hidden, when WebXR is unavailable

## 2. Comfort — the ones that make people ill

- [ ] No locomotion at all — the viewer stands at the centre of the sphere
- [ ] No forced camera movement, no artificial rotation, no acceleration
- [ ] The horizon stays level at all times
- [ ] Nothing is head-locked; any following UI uses a delayed lerp
- [ ] **Five-minute wear test.** Run the full cycle twice, use every dial,
      switch scenes. No nausea, no eye strain, no disorientation on removal
- [ ] Repeat the wear test with a second person who did not build it

## 3. Panels and legibility (PRD 4.6)

- [ ] Every panel sits between **0.75 m and 1.5 m**. Nothing closer than 0.5 m
- [ ] Primary UI is inside a ~60° forward cone. No neck-craning
- [ ] Wide panels are curved so the edges stay equidistant
- [ ] Every text block has an **opaque plate behind it** and stays readable
      against the crop row, the sky and a bright 360 clip
- [ ] Type is sized by angular size and legible without leaning in
- [ ] Panel colours match the 2D site — one palette, two renderers
- [ ] Hit targets are generously spaced; hover and press both give feedback
- [ ] Nothing important sits where a hand naturally occludes it

## 4. The video theatre

- [ ] 360 clips wrap correctly; 180 clips fill a hemisphere with no seam artefact
- [ ] Stereo layout matches the video row's `stereo` column
- [ ] Layer video is visibly sharper than the texture fallback
- [ ] The polyfill path works in desktop Chrome
- [ ] **Only one video plays at a time.** Switch clips repeatedly and confirm
      the previous one stops and releases its decoder
- [ ] Seeking a 4K 360 clip does not stall for more than ~2 s
- [ ] Switching clips mid-playback does not leave audio from the previous one
- [ ] The poster frame shows before playback starts

## 5. The cycle overlay

- [ ] The stage panel, timeline and disease-triangle glyph are all legible
      against bright footage, each on its own opaque plate
- [ ] The cycle runs end to end at the pathogen's optimum
- [ ] Dragging **leaf wetness** below the threshold halts the run **visibly**:
      an × marks the stage on the timeline and the panel names the missing
      condition
- [ ] The failure sentence matches the API's wording for the same stage, and
      matches what the 2D sidebar says
- [ ] The **disease triangle**'s environment leg goes dark when the run halts
- [ ] Later stages read "not reached", not "failed"
- [ ] Tomato leaf mould below 85% RH halts — the cleanest teaching case
- [ ] Spider mites behave in reverse: dry air favours them
- [ ] Nothing on the overlay obscures the part of the footage the user is
      being asked to look at

## 6. Performance — acceptance criteria, not aspiration

Measured with the **in-headset performance HUD**, not by feel.

- [ ] **72 FPS sustained** while a 360 clip plays with the overlay up
- [ ] Draw calls under ~60 — the scene is a sphere and a few plates
- [ ] Multiview enabled
- [ ] Fixed foveated rendering on
- [ ] No frame-time spike when a clip starts or loops
- [ ] Video decode does not stall the render thread on seek
- [ ] XR chunk plus first clip segment ≤ 12 MB on entry
- [ ] No `console.log` in the render loop
- [ ] No per-frame allocation in `useFrame` — check the heap over 60 s

**Gate 4 evidence:** a Quest screen capture of a 360 clip playing at 72 FPS with
the cycle overlay and the performance HUD visible. Attach it to the release.

## 7. Accessibility and exit

- [ ] Everything reachable with either hand
- [ ] Works seated and standing
- [ ] Exiting VR returns to `/field` in a sane state
- [ ] Removing the headset mid-session and returning does not wedge the scene
