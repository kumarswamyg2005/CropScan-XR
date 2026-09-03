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

- [ ] Teleport only. No smooth locomotion anywhere
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

## 4. The Row

- [ ] The diagnosed plant is in front of the user and marked
- [ ] Plants are instanced — check the draw-call count, not the look
- [ ] Teleport works to every reachable part of the row
- [ ] Teleport cannot put the user inside a plant or under the ground

## 5. Infection Theatre — the core

- [ ] The cycle runs end to end at the pathogen's optimum
- [ ] Dragging **leaf wetness** below the threshold halts the run **visibly**:
      spores stop, an × marks the stage, the panel names the missing condition
- [ ] The failure sentence matches the API's wording for the same stage
- [ ] The **disease triangle** glyph is legible, always visible, and its
      environment leg goes dark when the run halts
- [ ] Later stages read "not reached", not "failed"
- [ ] A `blocks` intervention halts the cycle at its stage
- [ ] A `reduces_inoculum` intervention does **not** halt it
- [ ] Re-running after applying an intervention shows the changed outcome
- [ ] The user's own Grad-CAM is visible beside the simulated lesion
- [ ] Tomato leaf mould below 85% RH halts — the cleanest teaching case
- [ ] Spider mites behave in reverse: dry air favours them

## 6. Field Theatre

- [ ] 360 clips use an equirect layer; flat clips use a quad layer
- [ ] Stereo layout matches the video row's `stereo` column
- [ ] Layer video is visibly sharper than the texture fallback
- [ ] The polyfill path works in desktop Chrome
- [ ] **Only one video plays at a time.** Switch clips repeatedly and confirm
      the previous one stops
- [ ] Seeking a 4K 360 clip does not stall for more than ~2 s
- [ ] Spot-the-symptom hotspots are selectable and score correctly

## 7. Performance — acceptance criteria, not aspiration

Measured with the **in-headset performance HUD**, not by feel.

- [ ] **72 FPS sustained** in the Infection Theatre with the full spore effect
- [ ] Draw calls under ~120
- [ ] Multiview enabled
- [ ] Fixed foveated rendering on for the heavy scene
- [ ] No frame-time spikes when switching scenes
- [ ] XR chunk plus assets ≤ 12 MB on first entry
- [ ] No `console.log` in the render loop
- [ ] No per-frame allocation in `useFrame` — check the heap over 60 s

**Gate 4 evidence:** a Quest screen capture of the Infection Theatre at 72 FPS
with the HUD visible. Attach it to the release.

## 8. Accessibility and exit

- [ ] Everything reachable with either hand
- [ ] Works seated and standing
- [ ] Exiting VR returns to `/field` in a sane state
- [ ] Removing the headset mid-session and returning does not wedge the scene
