import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type {
  CapsuleCollider,
  EllipsoidCollider,
  FloorCollider,
} from "../lib/fabricColliders";

import { createFabricSimulation, EPSILON } from "../lib/createFabricSimulation";
import type {
  CompiledFabricGarment,
  FabricPanelTopology,
} from "../lib/compileFabricGarment";

type FabricGarmentPreviewProps = {
  compiledFabric: CompiledFabricGarment;
  selectedPieceId?: string | null;
  onSelectPiece?: (pieceId: string) => void;
  colliders: EllipsoidCollider[];
  floor: FloorCollider;
  capsuleColliders: CapsuleCollider[];
};

type FabricPanelMeshProps = {
  panel: FabricPanelTopology;
  simulationPositions: Float32Array;
  isSelected: boolean;
  onSelectPiece?: (pieceId: string) => void;
};

const FIXED_DELTA_SECONDS = 1 / 60;
const MAX_SUBSTEPS = 4;
const MAX_ACCUMULATED_TIME = FIXED_DELTA_SECONDS * MAX_SUBSTEPS;

function FabricPanelMesh({
  panel,
  simulationPositions,
  isSelected,
  onSelectPiece,
}: FabricPanelMeshProps) {
  const normalUpdateFrame = useRef(0);

  const geometry = useMemo(() => {
    const panelPositions = new Float32Array(panel.particleCount * 3);

    for (
      let localParticleId = 0;
      localParticleId < panel.particleCount;
      localParticleId += 1
    ) {
      const globalParticleId = panel.particleStart + localParticleId;

      const globalOffset = globalParticleId * 3;
      const localOffset = localParticleId * 3;

      panelPositions[localOffset] = simulationPositions[globalOffset];

      panelPositions[localOffset + 1] = simulationPositions[globalOffset + 1];

      panelPositions[localOffset + 2] = simulationPositions[globalOffset + 2];
    }

    const nextGeometry = new THREE.BufferGeometry();

    const positionAttribute = new THREE.BufferAttribute(panelPositions, 3);

    positionAttribute.setUsage(THREE.DynamicDrawUsage);

    nextGeometry.setAttribute("position", positionAttribute);
    nextGeometry.setIndex(new THREE.BufferAttribute(panel.indices, 1));

    nextGeometry.computeVertexNormals();
    nextGeometry.computeBoundingSphere();

    return nextGeometry;
  }, [panel, simulationPositions]);

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  useFrame(() => {
    const positionAttribute = geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;

    for (
      let localParticleId = 0;
      localParticleId < panel.particleCount;
      localParticleId += 1
    ) {
      const globalParticleId = panel.particleStart + localParticleId;

      const globalOffset = globalParticleId * 3;
      const localOffset = localParticleId * 3;

      positionAttribute.array[localOffset] = simulationPositions[globalOffset];

      positionAttribute.array[localOffset + 1] =
        simulationPositions[globalOffset + 1];

      positionAttribute.array[localOffset + 2] =
        simulationPositions[globalOffset + 2];
    }

    positionAttribute.needsUpdate = true;

    normalUpdateFrame.current += 1;

    /*
     * Small mesh for now, so this is okay.
     * Later we optimise normals / rendering.
     */
    if (normalUpdateFrame.current % 2 === 0) {
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
    }
  });

  return (
    <mesh
      geometry={geometry}
      castShadow
      receiveShadow
      onClick={(event) => {
        event.stopPropagation();
        onSelectPiece?.(panel.pieceId);
      }}
    >
      <meshStandardMaterial
        wireframe
        color={isSelected ? "#f04b3a" : "#4c8df5"}
        side={THREE.DoubleSide}
        roughness={0.75}
        transparent
        opacity={isSelected ? 0.88 : 0.58}
      />
    </mesh>
  );
}

function ColliderDebug({ colliders }: { colliders: EllipsoidCollider[] }) {
  return (
    <>
      {colliders.map((collider) => {
        const radiusX = collider.radii[0] + collider.clearance;
        const radiusY = collider.radii[1] + collider.clearance;
        const radiusZ = collider.radii[2] + collider.clearance;

        return (
          <mesh
            key={collider.id}
            position={collider.centre}
            scale={[radiusX, radiusY, radiusZ]}
          >
            <sphereGeometry args={[1, 24, 16]} />
            <meshBasicMaterial
              color="#22c55e"
              wireframe
              transparent
              opacity={0.35}
              depthWrite={false}
            />
          </mesh>
        );
      })}
    </>
  );
}

function CapsuleColliderDebug({ colliders }: { colliders: CapsuleCollider[] }) {
  return (
    <>
      {colliders.map((collider) => {
        const start = new THREE.Vector3(...collider.start);
        const end = new THREE.Vector3(...collider.end);

        const direction = end.clone().sub(start);
        const segmentLength = direction.length();

        const centre = start.clone().add(end).multiplyScalar(0.5);

        const rotation =
          segmentLength > EPSILON
            ? new THREE.Quaternion().setFromUnitVectors(
                new THREE.Vector3(0, 1, 0),
                direction.normalize(),
              )
            : new THREE.Quaternion();

        return (
          <mesh key={collider.id} position={centre} quaternion={rotation}>
            <capsuleGeometry
              args={[
                collider.radius + collider.clearance,
                segmentLength,
                8,
                16,
              ]}
            />
            <meshBasicMaterial
              color="#a855f7"
              wireframe
              transparent
              opacity={0.28}
              depthWrite={false}
            />
          </mesh>
        );
      })}
    </>
  );
}

export function FabricGarmentPreview({
  compiledFabric,
  selectedPieceId,
  onSelectPiece,
  colliders,
  floor,
  capsuleColliders,
}: FabricGarmentPreviewProps) {
  const simulation = useMemo(
    () =>
      createFabricSimulation(compiledFabric, {
        iterations: 14,
        damping: 0.996,
        gravityY: -1.5,
        colliders,
        floor,
        capsuleColliders,
      }),
    [compiledFabric, colliders, floor, capsuleColliders],
  );

  const accumulatedTimeRef = useRef(0);

  useEffect(() => {
    accumulatedTimeRef.current = 0;
  }, [simulation]);

  useFrame((_, delta) => {
    accumulatedTimeRef.current = Math.min(
      accumulatedTimeRef.current + delta,
      MAX_ACCUMULATED_TIME,
    );

    let steps = 0;

    while (
      accumulatedTimeRef.current >= FIXED_DELTA_SECONDS &&
      steps < MAX_SUBSTEPS
    ) {
      simulation.step(FIXED_DELTA_SECONDS);

      accumulatedTimeRef.current -= FIXED_DELTA_SECONDS;
      steps += 1;
    }
  });

  return (
    <>
      <ColliderDebug colliders={colliders} />

      <CapsuleColliderDebug colliders={capsuleColliders} />

      {compiledFabric.panels.map((panel) => (
        <FabricPanelMesh
          key={panel.pieceId}
          panel={panel}
          simulationPositions={simulation.positions}
          isSelected={panel.pieceId === selectedPieceId}
          onSelectPiece={onSelectPiece}
        />
      ))}
    </>
  );
}
