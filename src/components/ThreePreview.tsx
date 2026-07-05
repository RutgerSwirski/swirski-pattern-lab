import { Html, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense, useEffect, useMemo } from "react";
import * as THREE from "three";

import type { PatternPiece, PointPosition, PreviewTransform } from "../types";

const METRES_PER_MILLIMETRE = 0.001;

type ThreePreviewProps = {
  modelUrl: string;
  pieces: PatternPiece[];
  selectedPieceId?: string | null;
  patternUnitsPerMillimetre?: number;
};

const DEFAULT_PREVIEW_TRANSFORMS: readonly PreviewTransform[] = [
  // Front torso
  {
    position: [0, 1.2, 0.36],
    rotation: [0, 0, 0],
  },

  // Back torso
  {
    position: [0, 1.2, -0.36],
    rotation: [0, Math.PI, 0],
  },

  // Left side
  {
    position: [-0.38, 1.2, 0],
    rotation: [0, -Math.PI / 2, 0],
  },

  // Right side
  {
    position: [0.38, 1.2, 0],
    rotation: [0, Math.PI / 2, 0],
  },

  // Extra pieces sit slightly outward for now
  {
    position: [-0.7, 1.45, 0.25],
    rotation: [0, -0.35, 0],
  },
  {
    position: [0.7, 1.45, 0.25],
    rotation: [0, 0.35, 0],
  },
] as const;

function getPreviewTransform(piece: PatternPiece, index: number) {
  if (piece.previewTransform) {
    return piece.previewTransform;
  }

  const slot =
    DEFAULT_PREVIEW_TRANSFORMS[index % DEFAULT_PREVIEW_TRANSFORMS.length];

  return {
    position: [...slot.position] as [number, number, number],
    rotation: [...slot.rotation] as [number, number, number],
  };
}

function AvatarModel({ modelUrl }: { modelUrl: string }) {
  const { scene } = useGLTF(modelUrl);

  useEffect(() => {
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
  }, [scene]);

  return <primitive object={scene} />;
}

function LoadingAvatar() {
  return (
    <Html center>
      <div
        style={{
          color: "white",
          fontFamily: "sans-serif",
          fontSize: 14,
        }}
      >
        Loading avatar…
      </div>
    </Html>
  );
}

function getPieceCentre(points: PointPosition[]) {
  const total = points.reduce(
    (current, point) => ({
      x: current.x + point.x,
      y: current.y + point.y,
    }),
    { x: 0, y: 0 },
  );

  return {
    x: total.x / points.length,
    y: total.y / points.length,
  };
}

function createPatternShape(
  piece: PatternPiece,
  patternUnitsPerMillimetre: number,
) {
  if (piece.points.length < 3) {
    return null;
  }

  const centre = getPieceCentre(piece.points);

  const toWorldPoint = (point: PointPosition) => {
    const millimetresX = (point.x - centre.x) / patternUnitsPerMillimetre;
    const millimetresY = (point.y - centre.y) / patternUnitsPerMillimetre;

    return new THREE.Vector2(
      millimetresX * METRES_PER_MILLIMETRE,
      -millimetresY * METRES_PER_MILLIMETRE,
    );
  };

  const [firstPoint, ...remainingPoints] = piece.points;
  const first = toWorldPoint(firstPoint);

  const shape = new THREE.Shape();
  shape.moveTo(first.x, first.y);

  for (const point of remainingPoints) {
    const next = toWorldPoint(point);
    shape.lineTo(next.x, next.y);
  }

  shape.closePath();

  return shape;
}

function PatternPiecePanel({
  piece,
  patternUnitsPerMillimetre,
  transform,
  isSelected,
}: {
  piece: PatternPiece;
  patternUnitsPerMillimetre: number;
  transform: {
    position: [number, number, number];
    rotation: [number, number, number];
  };
  isSelected: boolean;
}) {
  const shape = useMemo(() => {
    return createPatternShape(piece, patternUnitsPerMillimetre);
  }, [piece, patternUnitsPerMillimetre]);

  if (!shape) {
    return null;
  }

  return (
    <group position={transform.position} rotation={transform.rotation}>
      <mesh castShadow receiveShadow>
        <shapeGeometry args={[shape]} />

        <meshStandardMaterial
          color={isSelected ? "#f04b3a" : "#4c8df5"}
          side={THREE.DoubleSide}
          roughness={0.75}
          transparent
          opacity={isSelected ? 0.88 : 0.52}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function GarmentPreview({
  pieces,
  selectedPieceId,
  patternUnitsPerMillimetre,
}: {
  pieces: PatternPiece[];
  selectedPieceId?: string | null;
  patternUnitsPerMillimetre: number;
}) {
  const drawablePieces = pieces.filter((piece) => piece.points.length >= 3);

  return (
    <>
      {drawablePieces.map((piece, index) => (
        <PatternPiecePanel
          key={piece.id}
          piece={piece}
          isSelected={piece.id === selectedPieceId}
          transform={getPreviewTransform(piece, index)}
          patternUnitsPerMillimetre={patternUnitsPerMillimetre}
        />
      ))}
    </>
  );
}

export function ThreePreview({
  modelUrl,
  pieces,
  selectedPieceId,
  patternUnitsPerMillimetre = 1,
}: ThreePreviewProps) {
  return (
    <Canvas
      shadows
      camera={{
        position: [0, 1.3, 4],
        fov: 40,
        near: 0.01,
        far: 100,
      }}
      style={{
        width: "100%",
        height: "100%",
        background: "#262626",
      }}
    >
      <Suspense fallback={<LoadingAvatar />}>
        <color attach="background" args={["#262626"]} />

        <ambientLight intensity={2} />

        <directionalLight castShadow intensity={3} position={[3, 5, 4]} />

        <gridHelper args={[10, 10]} />

        <AvatarModel modelUrl={modelUrl} />

        <GarmentPreview
          pieces={pieces}
          selectedPieceId={selectedPieceId}
          patternUnitsPerMillimetre={patternUnitsPerMillimetre}
        />
      </Suspense>

      <OrbitControls
        enablePan={false}
        enableDamping
        target={[0, 1, 0]}
        minDistance={1}
        maxDistance={8}
      />
    </Canvas>
  );
}
