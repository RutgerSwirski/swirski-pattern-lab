import {
  Html,
  OrbitControls,
  useGLTF,
  TransformControls,
} from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";

import type { PatternPiece, PointPosition, PreviewTransform } from "../types";

const METRES_PER_MILLIMETRE = 0.001;

type ThreePreviewProps = {
  modelUrl: string;
  pieces: PatternPiece[];
  selectedPieceId?: string | null;
  patternUnitsPerMillimetre?: number;

  onSelectPiece?: (pieceId: string) => void;
  onUpdatePiecePreviewTransform?: (
    pieceId: string,
    transform: PreviewTransform,
  ) => void;

  onClearSelection?: () => void;
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

function AvatarModel({
  modelUrl,
  onClearSelection,
}: {
  modelUrl: string;
  onClearSelection?: () => void;
}) {
  const { scene } = useGLTF(modelUrl);

  useEffect(() => {
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
  }, [scene]);

  return (
    <group
      onClick={(event) => {
        event.stopPropagation();
        onClearSelection?.();
      }}
    >
      <primitive object={scene} />
    </group>
  );
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

  const shape = new THREE.Shape();

  const firstPoint = toWorldPoint(piece.points[0]);

  shape.moveTo(firstPoint.x, firstPoint.y);

  for (let index = 0; index < piece.points.length; index += 1) {
    const start = piece.points[index];
    const end = piece.points[(index + 1) % piece.points.length];

    const endWorld = toWorldPoint(end);

    const isBezier = Boolean(start.curveOut || end.curveIn);

    if (!isBezier) {
      shape.lineTo(endWorld.x, endWorld.y);
      continue;
    }

    /*
     * A cubic Bézier segment has:
     *
     * start anchor
     * → start.curveOut
     * → end.curveIn
     * → end anchor
     *
     * Missing handles fall back to their anchor point. That means
     * one-handle curves still render correctly.
     */
    const startControl = toWorldPoint(start.curveOut ?? start);
    const endControl = toWorldPoint(end.curveIn ?? end);

    shape.bezierCurveTo(
      startControl.x,
      startControl.y,
      endControl.x,
      endControl.y,
      endWorld.x,
      endWorld.y,
    );
  }

  shape.closePath();

  return shape;
}

function PatternPiecePanel({
  piece,
  patternUnitsPerMillimetre,
  transform,
  isSelected,
  onSelectPiece,
  onRegisterObject,
  onUnregisterObject,
}: {
  piece: PatternPiece;
  patternUnitsPerMillimetre: number;
  transform: PreviewTransform;
  isSelected: boolean;
  onSelectPiece?: (pieceId: string) => void;
  onRegisterObject: (pieceId: string, object: THREE.Group) => void;
  onUnregisterObject: (pieceId: string) => void;
}) {
  const panelRef = useRef<THREE.Group>(null);

  const geometry = useMemo(() => {
    const shape = createPatternShape(piece, patternUnitsPerMillimetre);

    if (!shape) {
      return null;
    }

    const nextGeometry = new THREE.ShapeGeometry(shape, 24);

    // Guarantees the gizmo pivot is visually centred on the fabric panel.
    nextGeometry.center();

    return nextGeometry;
  }, [piece, patternUnitsPerMillimetre]);

  useEffect(() => {
    const panel = panelRef.current;

    if (!panel) {
      return;
    }

    onRegisterObject(piece.id, panel);

    return () => {
      onUnregisterObject(piece.id);
    };
  }, [onRegisterObject, onUnregisterObject, piece.id]);

  useEffect(() => {
    return () => {
      geometry?.dispose();
    };
  }, [geometry]);

  if (!geometry) {
    return null;
  }

  return (
    <group
      ref={panelRef}
      position={transform.position}
      rotation={transform.rotation}
      onClick={(event) => {
        event.stopPropagation();
        onSelectPiece?.(piece.id);
      }}
    >
      <mesh geometry={geometry} castShadow receiveShadow>
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

function getTransformFromObject(object: THREE.Object3D): PreviewTransform {
  return {
    position: [object.position.x, object.position.y, object.position.z],
    rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
  };
}

function SelectedPieceTransformGizmo({
  pieceId,
  object,
  onCommitTransform,
}: {
  pieceId: string;
  object: THREE.Group | null;
  onCommitTransform: (pieceId: string, transform: PreviewTransform) => void;
}) {
  const pendingTransformRef = useRef<PreviewTransform | null>(null);
  const isDraggingRef = useRef(false);

  const commitTransform = useCallback(() => {
    if (!object) {
      return;
    }

    const transform =
      pendingTransformRef.current ?? getTransformFromObject(object);

    onCommitTransform(pieceId, transform);

    pendingTransformRef.current = null;
    isDraggingRef.current = false;
  }, [object, onCommitTransform, pieceId]);

  useEffect(() => {
    return () => {
      // Covers the edge case where selection changes mid-drag.
      if (isDraggingRef.current) {
        commitTransform();
      }
    };
  }, [commitTransform]);

  if (!object) {
    return null;
  }

  return (
    <TransformControls
      object={object}
      mode="translate"
      space="world"
      size={0.75}
      translationSnap={0.01}
      onObjectChange={() => {
        isDraggingRef.current = true;
        pendingTransformRef.current = getTransformFromObject(object);
      }}
      onMouseUp={commitTransform}
    />
  );
}

function GarmentPreview({
  pieces,
  selectedPieceId,
  patternUnitsPerMillimetre,
  onSelectPiece,
  onUpdatePiecePreviewTransform,
}: {
  pieces: PatternPiece[];
  selectedPieceId?: string | null;
  patternUnitsPerMillimetre: number;
  onSelectPiece?: (pieceId: string) => void;
  onUpdatePiecePreviewTransform: (
    pieceId: string,
    transform: PreviewTransform,
  ) => void;
}) {
  const objectsByPieceIdRef = useRef(new Map<string, THREE.Group>());

  const [selectedObject, setSelectedObject] = useState<THREE.Group | null>(
    null,
  );

  const selectedPieceIdRef = useRef(selectedPieceId);

  useEffect(() => {
    selectedPieceIdRef.current = selectedPieceId;

    setSelectedObject(
      selectedPieceId
        ? (objectsByPieceIdRef.current.get(selectedPieceId) ?? null)
        : null,
    );
  }, [selectedPieceId]);

  const registerObject = useCallback((pieceId: string, object: THREE.Group) => {
    objectsByPieceIdRef.current.set(pieceId, object);

    if (pieceId === selectedPieceIdRef.current) {
      setSelectedObject(object);
    }
  }, []);

  const unregisterObject = useCallback((pieceId: string) => {
    const object = objectsByPieceIdRef.current.get(pieceId);

    objectsByPieceIdRef.current.delete(pieceId);

    setSelectedObject((currentObject) =>
      currentObject === object ? null : currentObject,
    );
  }, []);

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
          onSelectPiece={onSelectPiece}
          onRegisterObject={registerObject}
          onUnregisterObject={unregisterObject}
        />
      ))}

      {selectedPieceId && (
        <SelectedPieceTransformGizmo
          pieceId={selectedPieceId}
          object={selectedObject}
          onCommitTransform={onUpdatePiecePreviewTransform}
        />
      )}
    </>
  );
}
export function ThreePreview({
  modelUrl,
  pieces,
  selectedPieceId,
  patternUnitsPerMillimetre = 1,
  onSelectPiece,
  onUpdatePiecePreviewTransform,
  onClearSelection,
}: ThreePreviewProps) {
  return (
    <Canvas
      shadows
      onPointerMissed={() => onClearSelection?.()}
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

        <AvatarModel onClearSelection={onClearSelection} modelUrl={modelUrl} />

        <GarmentPreview
          pieces={pieces}
          selectedPieceId={selectedPieceId}
          patternUnitsPerMillimetre={patternUnitsPerMillimetre}
          onSelectPiece={onSelectPiece}
          onUpdatePiecePreviewTransform={onUpdatePiecePreviewTransform}
        />
      </Suspense>

      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        target={[0, 1, 0]}
        minDistance={1}
        maxDistance={8}
      />
    </Canvas>
  );
}
