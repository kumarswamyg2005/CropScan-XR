import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import { Object3D, type InstancedMesh } from 'three'

import { tokenHex } from '../tokens'

const ROW_LENGTH = 10
const PLANTS_PER_SIDE = 12

/**
 * Scene 1 — The Row.
 *
 * Plants are instanced rather than placed as individual meshes. Quest is
 * CPU/draw-call bound, not triangle bound: a hundred separate plant meshes
 * would miss 72 FPS on draw calls alone, while one InstancedMesh of a hundred
 * is a single call (issue #40).
 *
 * ponytail: the plant is built from primitives, not a glTF. It keeps the XR
 * chunk inside the 12 MB budget with nothing to download, and the row is
 * scene-setting, not the thing being taught. The upgrade path is a Draco
 * glTF with LODs swapped into the same InstancedMesh — the instancing and
 * per-instance health attribute do not change.
 */
export default function TheRow({
  diagnosedIndex = 6,
  healthLabel,
}: {
  diagnosedIndex?: number
  healthLabel: string
}) {
  const leaves = useRef<InstancedMesh>(null)
  const stems = useRef<InstancedMesh>(null)

  const layout = useMemo(() => {
    const dummy = new Object3D()
    const entries: Array<{ position: [number, number, number]; scale: number }> = []
    for (let side = 0; side < 2; side += 1) {
      for (let i = 0; i < PLANTS_PER_SIDE; i += 1) {
        entries.push({
          position: [
            side === 0 ? -0.7 : 0.7,
            0,
            -1 - (i / PLANTS_PER_SIDE) * ROW_LENGTH,
          ],
          // Deterministic jitter: a row of identical plants reads as a texture,
          // not a crop, but Math.random() would reshuffle on every re-render.
          scale: 0.85 + ((i * 37 + side * 13) % 20) / 100,
        })
      }
    }
    return { dummy, entries }
  }, [])

  useFrame(() => {
    // Written once on the first frame, then skipped. No per-frame allocation
    // and no per-frame matrix churn in the render loop (issue #40).
    if (!leaves.current || !stems.current || leaves.current.userData.written) return

    layout.entries.forEach((entry, i) => {
      layout.dummy.position.set(entry.position[0], 0.55 * entry.scale, entry.position[2])
      layout.dummy.scale.setScalar(entry.scale)
      layout.dummy.rotation.set(0, (i % 7) * 0.4, 0)
      layout.dummy.updateMatrix()
      leaves.current!.setMatrixAt(i, layout.dummy.matrix)

      layout.dummy.position.set(entry.position[0], 0.28 * entry.scale, entry.position[2])
      layout.dummy.scale.set(0.06, 0.55 * entry.scale, 0.06)
      layout.dummy.rotation.set(0, 0, 0)
      layout.dummy.updateMatrix()
      stems.current!.setMatrixAt(i, layout.dummy.matrix)
    })

    leaves.current.instanceMatrix.needsUpdate = true
    stems.current.instanceMatrix.needsUpdate = true
    leaves.current.userData.written = true
  })

  const diagnosed = layout.entries[diagnosedIndex]

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -6]} receiveShadow={false}>
        <planeGeometry args={[8, 16]} />
        <meshStandardMaterial color={tokenHex('necrosis')} roughness={1} />
      </mesh>

      <instancedMesh ref={stems} args={[undefined, undefined, layout.entries.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={tokenHex('chlorophyll')} roughness={0.9} />
      </instancedMesh>

      <instancedMesh ref={leaves} args={[undefined, undefined, layout.entries.length]}>
        <sphereGeometry args={[0.3, 8, 6]} />
        <meshStandardMaterial color={tokenHex('chlorophyll')} roughness={0.85} flatShading />
      </instancedMesh>

      {/* The diagnosed plant is the one in front of you, marked. */}
      {diagnosed && (
        <group position={[diagnosed.position[0], 0, diagnosed.position[2]]}>
          <mesh position={[0, 0.55, 0]}>
            <sphereGeometry args={[0.34, 10, 8]} />
            <meshStandardMaterial color={tokenHex('chlorosis')} roughness={0.8} flatShading />
          </mesh>
          <Text
            position={[0, 1.15, 0]}
            fontSize={0.08}
            color={tokenHex('ink')}
            outlineWidth={0.008}
            outlineColor={tokenHex('sheet')}
            anchorX="center"
          >
            {healthLabel}
          </Text>
        </group>
      )}
    </group>
  )
}
