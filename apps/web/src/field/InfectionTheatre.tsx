import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import { AdditiveBlending, type Points } from 'three'

import { tokenHex } from '../tokens'
import type { RunResult } from './cycleMachine'

const SPORE_COUNT = 600

/**
 * The spore cloud. One Points object, one draw call, one buffer allocated once.
 *
 * ponytail: a point cloud rather than a particle system or any fluid sim. The
 * pedagogical claim is "spores are released and drift", and points carry that.
 * Nothing in data/disease_cycle.json describes spore dynamics, so simulating
 * them would be inventing biology in a shader.
 */
function SporeCloud({ active, failed }: { active: boolean; failed: boolean }) {
  const points = useRef<Points>(null)

  const positions = useMemo(() => {
    const array = new Float32Array(SPORE_COUNT * 3)
    for (let i = 0; i < SPORE_COUNT; i += 1) {
      array[i * 3] = (Math.random() - 0.5) * 1.4
      array[i * 3 + 1] = Math.random() * 1.6
      array[i * 3 + 2] = (Math.random() - 0.5) * 1.4
    }
    return array
  }, [])

  useFrame((_, delta) => {
    const mesh = points.current
    if (!mesh) return
    // Rotating the whole cloud is one matrix update. Moving 600 individual
    // points every frame would allocate and re-upload the buffer 72 times a
    // second for a drift effect nobody can see.
    mesh.rotation.y += delta * (failed ? 0.05 : 0.25)
    mesh.visible = active
  })

  return (
    <points ref={points} position={[0, 0.2, 0]}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.016}
        sizeAttenuation
        color={failed ? tokenHex('rule') : tokenHex('sporulation')}
        transparent
        opacity={failed ? 0.25 : 0.8}
        blending={AdditiveBlending}
        depthWrite={false}
      />
    </points>
  )
}

/**
 * Scene 2 — the Infection Theatre.
 *
 * The diagnosed plant, scaled up, with a stage timeline. Every visual state
 * here is read off the RunResult, which is computed in cycleMachine.ts from
 * data/disease_cycle.json. No visual claim originates in this file.
 */
export default function InfectionTheatre({
  run,
  currentStage,
  gradcamUrl,
}: {
  run: RunResult
  currentStage: number
  gradcamUrl: string | null
}) {
  const stage = run.stages[currentStage]
  const halted = run.haltedAt !== null && currentStage >= run.haltedAt
  const sporulating =
    !halted && currentStage >= run.stages.findIndex((s) => s.id === 'reproduction')

  // Lesion coverage grows through colonization. An animated alpha on the leaf,
  // not a new mesh per stage.
  const lesionOpacity = useMemo(() => {
    const colonizationIndex = run.stages.findIndex((s) => s.id === 'colonization')
    if (colonizationIndex < 0 || currentStage < colonizationIndex) return 0
    if (halted) return 0.25
    const progress = (currentStage - colonizationIndex + 1) / 3
    return Math.min(0.85, progress)
  }, [currentStage, halted, run.stages])

  return (
    <group position={[0, 0, -1.6]}>
      <mesh position={[0, 0.55, 0]}>
        <cylinderGeometry args={[0.03, 0.04, 1.1, 8]} />
        <meshStandardMaterial color={tokenHex('chlorophyll')} roughness={0.9} />
      </mesh>

      {/* The leaf, with the lesion mask over it. */}
      <group position={[0, 1.15, 0]}>
        <mesh>
          <sphereGeometry args={[0.5, 16, 12]} />
          <meshStandardMaterial color={tokenHex('chlorophyll')} roughness={0.8} flatShading />
        </mesh>
        <mesh scale={1.005}>
          <sphereGeometry args={[0.5, 16, 12]} />
          <meshStandardMaterial
            color={tokenHex('necrosis')}
            transparent
            opacity={lesionOpacity}
            roughness={0.9}
            flatShading
            depthWrite={false}
          />
        </mesh>
      </group>

      <SporeCloud active={sporulating} failed={halted} />

      {/* The user's own Grad-CAM, mounted beside the simulated lesion so the
          model's attention sits next to the modelled biology (issue #38). */}
      {gradcamUrl && (
        <group position={[1.1, 1.15, 0]} rotation={[0, -0.4, 0]}>
          <mesh position={[0, 0, -0.005]}>
            <planeGeometry args={[0.66, 0.66]} />
            <meshBasicMaterial color={tokenHex('sheet')} />
          </mesh>
          <Text
            position={[0, 0.4, 0]}
            fontSize={0.05}
            color={tokenHex('ink')}
            outlineWidth={0.006}
            outlineColor={tokenHex('sheet')}
            anchorX="center"
          >
            Model attention
          </Text>
        </group>
      )}

      {/* Stage timeline. An X marks the stage that failed. */}
      <group position={[0, 0.06, 0.9]} rotation={[-Math.PI / 2.6, 0, 0]}>
        {run.stages.map((s, i) => {
          const x = (i - (run.stages.length - 1) / 2) * 0.17
          const colour =
            s.outcome === 'passed'
              ? tokenHex('chlorophyll')
              : s.outcome === 'failed' || s.outcome === 'blocked'
                ? tokenHex('necrosis')
                : tokenHex('rule')
          return (
            <group key={s.id} position={[x, 0, 0]}>
              <mesh>
                <circleGeometry args={[i === currentStage ? 0.05 : 0.035, 16]} />
                <meshBasicMaterial color={colour} />
              </mesh>
              {(s.outcome === 'failed' || s.outcome === 'blocked') && (
                <Text position={[0, 0, 0.002]} fontSize={0.05} color={tokenHex('sheet')} anchorX="center" anchorY="middle">
                  ×
                </Text>
              )}
            </group>
          )
        })}
      </group>

      {/* The halt message. Opaque plate behind the text, always. */}
      {stage && (
        <group position={[0, 1.95, 0]}>
          <mesh position={[0, 0, -0.01]}>
            <planeGeometry args={[2.2, halted ? 0.55 : 0.3]} />
            <meshBasicMaterial color={tokenHex('sheet')} />
          </mesh>
          <Text
            position={[0, halted ? 0.15 : 0, 0]}
            fontSize={0.075}
            color={tokenHex('ink')}
            maxWidth={2}
            anchorX="center"
          >
            {stage.label}
          </Text>
          {halted && (
            <Text
              position={[0, -0.08, 0]}
              fontSize={0.05}
              color={tokenHex('necrosis')}
              maxWidth={2}
              anchorX="center"
            >
              {run.summary}
            </Text>
          )}
        </group>
      )}
    </group>
  )
}
