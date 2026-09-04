import { Container, Text } from '@react-three/uikit'

/**
 * The in-headset control panel.
 *
 * Every control on the 2D page is a DOM element, and DOM does not exist inside
 * an immersive session -- so in VR you could see the footage and the cycle but
 * could not touch a single dial, switch a clip, or pause. That is what made the
 * module "not VR compatible": it was a video player you could only watch.
 *
 * These are uikit panels, which are real 3D geometry, so the controller ray and
 * hand pointers hit them like any other mesh.
 *
 * Ergonomics are from the WebXR guidance the brief cites (PRD 4.6):
 *   - the panel sits at ~1.1 m, inside the 0.75-1.5 m comfort band, and never
 *     closer than 0.5 m where vergence-accommodation conflict starts
 *   - it is angled up toward the face rather than lying flat, and kept inside
 *     the ~60 degree forward cone so nothing needs a neck turn
 *   - hit targets are 56 px at pixelSize 0.0022, about 12 cm -- comfortably
 *     bigger than a controller ray's jitter
 *   - every control has a hover state, because without depth cues a flat panel
 *     gives no other feedback that the ray is on target
 *
 * Sliders are +/- steppers, not drag tracks. Dragging a thin track with a ray
 * from a metre away is precise work with a shaky pointer; two big buttons and a
 * readout is the same result without the fight.
 */

const INK = '#1e1a14'
const MUTED = '#7a6f5e'
const ACCENT = '#2d6a4f'
const ALERT = '#b84c30'
const SURFACE = '#fdfaf5'
const BORDER = '#ddd6c8'
const SUBTLE = '#d8ecd5'

function Button({ label, onClick, width = 56, disabled, tone = 'default' }) {
  const base = tone === 'primary' ? ACCENT : SURFACE
  return (
    <Container
      width={width}
      height={56}
      borderRadius={10}
      borderWidth={1}
      borderColor={tone === 'primary' ? ACCENT : BORDER}
      backgroundColor={disabled ? '#efe9dd' : base}
      hover={disabled ? undefined : { backgroundColor: tone === 'primary' ? '#1b4d38' : SUBTLE }}
      justifyContent="center"
      alignItems="center"
      cursor={disabled ? undefined : 'pointer'}
      onClick={disabled ? undefined : onClick}
    >
      <Text fontSize={22} color={disabled ? '#b0a898' : tone === 'primary' ? SURFACE : INK}>
        {label}
      </Text>
    </Container>
  )
}

/** One environment dial: label, value, a fill bar, and a stepper either side. */
function Dial({ label, value, unit, min, max, step, onChange }) {
  const fraction = Math.max(0, Math.min(1, (value - min) / (max - min)))
  return (
    <Container flexDirection="column" gap={6} marginBottom={12}>
      <Container flexDirection="row" justifyContent="space-between" alignItems="center">
        <Text fontSize={19} color={MUTED}>{label}</Text>
        <Text fontSize={21} color={INK}>{`${value} ${unit}`}</Text>
      </Container>

      <Container flexDirection="row" alignItems="center" gap={10}>
        <Button label="−" onClick={() => onChange(Math.max(min, value - step))} />

        {/* Fill bar. Read-only: it reports, the steppers set. */}
        <Container
          flexGrow={1}
          height={16}
          borderRadius={8}
          backgroundColor="#e6dfd2"
          overflow="hidden"
        >
          <Container width={`${fraction * 100}%`} height="100%" backgroundColor={ACCENT} />
        </Container>

        <Button label="+" onClick={() => onChange(Math.min(max, value + step))} />
      </Container>
    </Container>
  )
}

export default function VrControls({
  run,
  dials,
  ranges,
  onDial,
  onReset,
  videos,
  videoIndex,
  onPickVideo,
  playing,
  onTogglePlay,
  pathogen,
}) {
  const halted = run?.haltedAt != null
  const current = videos[videoIndex]

  return (
    // 1.1 m out, raised to chest height and tilted up toward the face. Anything
    // laid flat at this distance is read at a punishing angle.
    <group position={[0, 1.02, -1.12]} rotation={[-0.42, 0, 0]}>
      <Container
        // Sized by ANGLE, not by taste. 700 px at 0.0017 m/px is 1.19 m wide,
        // and 1.19 m at 1.12 m away subtends about 56 degrees -- inside the ~60
        // degree forward cone the guidance calls for. At the previous 780 px
        // and 0.0022 it was 1.72 m, about 77 degrees, which needs a head turn
        // to read the ends of.
        pixelSize={0.0017}
        width={700}
        flexDirection="column"
        backgroundColor="#f6f2eb"
        borderRadius={20}
        borderWidth={2}
        borderColor={BORDER}
        padding={22}
        gap={4}
      >
        {/* ---- what is happening in the cycle ---- */}
        <Container flexDirection="row" justifyContent="space-between" alignItems="center" marginBottom={10}>
          <Text fontSize={17} color={MUTED}>{pathogen ?? 'Infection cycle'}</Text>
          <Text fontSize={17} color={halted ? ALERT : ACCENT}>
            {halted ? 'cycle halted' : 'cycle running'}
          </Text>
        </Container>

        {run && (
          <Container
            flexDirection="column"
            backgroundColor={SURFACE}
            borderRadius={12}
            borderWidth={1}
            borderColor={halted ? ALERT : BORDER}
            padding={14}
            marginBottom={14}
          >
            <Text fontSize={20} color={halted ? ALERT : INK}>
              {run.summary}
            </Text>

            {/* Stage dots: green passed, red failed, pale not reached. */}
            <Container flexDirection="row" gap={7} marginTop={12} alignItems="center">
              {run.stages.map((s) => (
                <Container
                  key={s.id}
                  width={26}
                  height={26}
                  borderRadius={13}
                  backgroundColor={
                    s.outcome === 'passed' ? ACCENT
                    : s.outcome === 'failed' || s.outcome === 'blocked' ? ALERT
                    : '#ded7c9'
                  }
                />
              ))}
            </Container>
          </Container>
        )}

        {/* ---- the three dials ---- */}
        {dials && ranges && (
          <Container flexDirection="column">
            <Dial
              label="Temperature" value={dials.temp_c} unit="°C"
              min={ranges.temp_c.min} max={ranges.temp_c.max} step={1}
              onChange={(v) => onDial('temp_c', v)}
            />
            <Dial
              label="Leaf wetness" value={dials.leaf_wetness_hr} unit="h"
              min={ranges.leaf_wetness_hr.min} max={ranges.leaf_wetness_hr.max} step={1}
              onChange={(v) => onDial('leaf_wetness_hr', v)}
            />
            <Dial
              label="Humidity" value={dials.rh_pct} unit="%"
              min={ranges.rh_pct.min} max={ranges.rh_pct.max} step={5}
              onChange={(v) => onDial('rh_pct', v)}
            />
          </Container>
        )}

        {/* ---- playback and clips ---- */}
        <Container flexDirection="row" gap={10} alignItems="center" marginTop={6}>
          <Button
            label={playing ? 'Pause' : 'Play'}
            width={128}
            tone="primary"
            onClick={onTogglePlay}
            disabled={!current}
          />
          <Button label="Reset" width={110} onClick={onReset} />

          {videos.length > 1 && (
            <>
              <Button
                label="‹ Prev"
                width={104}
                onClick={() => onPickVideo((videoIndex - 1 + videos.length) % videos.length)}
              />
              <Button
                label="Next ›"
                width={104}
                onClick={() => onPickVideo((videoIndex + 1) % videos.length)}
              />
            </>
          )}
        </Container>

        {current && (
          <Container marginTop={12} flexDirection="column">
            <Text fontSize={18} color={INK}>{current.title}</Text>
            <Text fontSize={15} color={MUTED}>
              {`${videoIndex + 1} of ${videos.length}${current.attribution ? ` · ${current.attribution}` : ''}`}
            </Text>
          </Container>
        )}
      </Container>
    </group>
  )
}
