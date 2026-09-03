import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { XR } from '@react-three/xr'

import type { DiseaseCycle, Intervention, Video } from '../lib/api'
import { tokenHex } from '../tokens'
import DiseaseTriangle from './DiseaseTriangle'
import FieldTheatre from './FieldTheatre'
import InfectionTheatre from './InfectionTheatre'
import TheRow from './TheRow'
import { optimalDials, runCycle, suggestBreak, type Dials } from './cycleMachine'
import { xrStore } from './store'

export type SceneName = 'row' | 'theatre' | 'video'

/**
 * The 3D half of the field module. Everything three.js lives at or below this
 * file so the landing page never downloads it.
 *
 * Degrades to orbit controls with no headset — the same scene, the same stage
 * machine, just a mouse instead of a controller.
 */
export default function FieldScene({
  cycle,
  scene,
  dials,
  currentStage,
  interventions,
  gradcamUrl,
  diseaseName,
  video,
}: {
  cycle: DiseaseCycle
  scene: SceneName
  dials: Dials
  currentStage: number
  interventions: Intervention[]
  gradcamUrl: string | null
  diseaseName: string
  video?: Video | null
}) {
  const run = runCycle(cycle, dials, interventions)

  return (
    <Canvas
      camera={{ position: [0, 1.6, 1.2], fov: 60 }}
      // Multiview is what keeps the frame budget reachable on Quest 3.
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      dpr={[1, 1.5]}
    >
      <color attach="background" args={[tokenHex('ground')]} />
      <hemisphereLight intensity={1.1} groundColor={tokenHex('necrosis')} />
      <directionalLight position={[3, 6, 2]} intensity={1.4} />

      <XR store={xrStore}>
        <Suspense fallback={null}>
          {scene === 'row' && <TheRow healthLabel={diseaseName} />}

          {scene === 'theatre' && (
            <InfectionTheatre
              run={run}
              currentStage={currentStage}
              gradcamUrl={gradcamUrl}
            />
          )}

          {scene === 'video' && video && <FieldTheatre video={video} />}

          {/* Persistent HUD glyph, 1.2 m out and inside the forward cone. It
              is hidden in the video scene so it cannot sit in front of a 360
              clip the viewer is trying to read symptoms off. */}
          {scene !== 'video' && (
            <DiseaseTriangle run={run} position={[-0.75, 1.5, -1.2]} scale={1.6} />
          )}
        </Suspense>
      </XR>

      <OrbitControls target={[0, 1.1, -1.6]} enablePan={false} maxPolarAngle={Math.PI / 1.9} />
    </Canvas>
  )
}

/** Re-exported so the 2D page can drive the same machine without importing three. */
export { optimalDials, runCycle, suggestBreak }
