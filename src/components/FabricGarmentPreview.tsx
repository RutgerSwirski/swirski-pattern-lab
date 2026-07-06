import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { createFabricSimulation } from "../lib/createFabricSimulation";
import type {
  CompiledFabricGarment,
  FabricPanelTopology,
} from "../lib/compileFabricGarment";

type FabricGarmentPreviewProps = {
  compiledFabric: CompiledFabricGarment;
  selectedPieceId?: string | null;
  onSelectPiece?: (pieceId: string) => void;
};

type FabricPanelMeshProps = {
  panel: FabricPanelTopology;
  simulationPositions: Float32Array;
  isSelected: boolean;
  onSelectPiece?: (pieceId: string) => void;
};

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

export function FabricGarmentPreview({
  compiledFabric,
  selectedPieceId,
  onSelectPiece,
}: FabricGarmentPreviewProps) {
  const simulation = useMemo(
    () =>
      createFabricSimulation(compiledFabric, {
        iterations: 14,
        damping: 0.996,
        gravityY: 0,
      }),
    [compiledFabric],
  );

  useFrame((_, delta) => {
    simulation.step(delta);
  });

  return (
    <>
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
