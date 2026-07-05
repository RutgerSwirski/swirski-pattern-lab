import { Html, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense, useEffect, useMemo } from "react";
import * as THREE from "three";

import type { PatternPiece, PointPosition } from "../types";

const METRES_PER_MILLIMETRE = 0.001;

/*
 * Your avatar likely faces towards +Z in the current preview.
 * If the fabric appears behind the body, change 0.35 to -0.35.
 */
const GARMENT_POSITION: [number, number, number] = [0, 1.2, -0.35];
type ThreePreviewProps = {
  modelUrl: string;
  pieces: PatternPiece[];
  selectedPieceId?: string | null;

  /*
   * Your editor probably stores points in pixels rather than millimetres.
   * Pass MM_TO_PX from patternConfig here.
   *
   * If points are already stored in mm, use 1.
   */
  patternUnitsPerMillimetre?: number;
};

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
}: {
  piece: PatternPiece;
  patternUnitsPerMillimetre: number;
}) {
  const shape = useMemo(() => {
    return createPatternShape(piece, patternUnitsPerMillimetre);
  }, [piece, patternUnitsPerMillimetre]);

  if (!shape) {
    return null;
  }

  return (
    <mesh castShadow receiveShadow position={GARMENT_POSITION}>
      <shapeGeometry args={[shape]} />

      <meshStandardMaterial
        color="#e94b3c"
        side={THREE.DoubleSide}
        roughness={0.75}
        metalness={0}
        transparent
        opacity={0.78}
      />
    </mesh>
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
  const previewPiece = useMemo(() => {
    const selectedPiece = pieces.find((piece) => piece.id === selectedPieceId);

    return selectedPiece ?? pieces.find((piece) => piece.points.length >= 3);
  }, [pieces, selectedPieceId]);

  if (!previewPiece) {
    return null;
  }

  return (
    <PatternPiecePanel
      key={previewPiece.id}
      piece={previewPiece}
      patternUnitsPerMillimetre={patternUnitsPerMillimetre}
    />
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
