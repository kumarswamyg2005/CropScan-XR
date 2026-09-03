import { Line, Text } from '@react-three/drei'
import { useMemo } from 'react'

import { tokenHex } from '../tokens'
import type { RunResult } from './cycleMachine'

/**
 * The disease triangle as a persistent HUD glyph: three legs that light up as
 * each is satisfied. Break a leg and the cycle stops.
 *
 * This is the whole pedagogical point of the module, so it is always on screen
 * rather than tucked into a panel (issue #38).
 */
export default function DiseaseTriangle({
  run,
  position = [0, 0, 0],
  scale = 1,
}: {
  run: RunResult
  position?: [number, number, number]
  scale?: number
}) {
  const vertices = useMemo<Array<[number, number, number]>>(
    () => [
      [0, 0.13, 0],       // host, apex
      [-0.115, -0.07, 0], // pathogen, lower left
      [0.115, -0.07, 0],  // environment, lower right
    ],
    [],
  )

  const legs: Array<{ from: number; to: number; lit: boolean; label: string }> = [
    { from: 0, to: 1, lit: run.triangle.host && run.triangle.pathogen, label: 'Host' },
    {
      from: 1,
      to: 2,
      lit: run.triangle.pathogen && run.triangle.environment,
      label: 'Pathogen',
    },
    {
      from: 2,
      to: 0,
      lit: run.triangle.environment && run.triangle.host,
      label: 'Environment',
    },
  ]

  const lit = tokenHex('chlorophyll')
  const dark = tokenHex('rule')

  return (
    <group position={position} scale={scale}>
      {/* Opaque plate behind everything, so the glyph stays legible against
          the scene rather than dissolving into the crop row (PRD 4.6). */}
      <mesh position={[0, 0.02, -0.006]}>
        <planeGeometry args={[0.34, 0.32]} />
        <meshBasicMaterial color={tokenHex('sheet')} />
      </mesh>

      {legs.map((leg) => (
        <Line
          key={leg.label}
          points={[vertices[leg.from]!, vertices[leg.to]!]}
          color={leg.lit ? lit : dark}
          lineWidth={leg.lit ? 4 : 2}
        />
      ))}

      {vertices.map((vertex, i) => (
        <mesh key={i} position={vertex}>
          <circleGeometry args={[0.012, 12]} />
          <meshBasicMaterial
            color={
              [run.triangle.host, run.triangle.pathogen, run.triangle.environment][i]
                ? lit
                : dark
            }
          />
        </mesh>
      ))}

      <Text
        position={[0, 0.175, 0]}
        fontSize={0.022}
        color={tokenHex('ink')}
        anchorX="center"
      >
        Disease triangle
      </Text>
      <Text position={[0, -0.115, 0]} fontSize={0.018} color={tokenHex('ink-soft')} anchorX="center">
        {run.triangle.environment ? 'all three satisfied' : 'environment leg broken'}
      </Text>
    </group>
  )
}
