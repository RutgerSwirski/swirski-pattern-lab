import {
  Html,
  OrbitControls,
  TransformControls,
  useGLTF,
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

import type {
  PatternPiece,
  PatternSeam,
  PiecePreviewTransformUpdate,
  PointPosition,
  PreviewTransform,
} from "../types";

import { compileGarment } from "../lib/compileGarment";

import {
  compileStitchConstraints,
  getPatternEdgePoint,
  type PatternEdgeSample,
  type StitchConstraint,
} from "../lib/compileStitchConstraints";

type TransformMode = "translate" | "rotate";

const METRES_PER_MILLIMETRE = 0.001;

type ThreePreviewProps = {
  modelUrl: string;
  pieces: PatternPiece[];
  selectedPieceId?: string | null;
  patternUnitsPerMillimetre?: number;

  onSelectPiece?: (pieceId: string) => void;
  onUpdatePiecePreviewTransform: (
    pieceId: string,
    transform: PreviewTransform,
  ) => void;

  onUpdatePiecePreviewTransforms: (
    updates: PiecePreviewTransformUpdate[],
  ) => void;

  onClearSelection?: () => void;

  seams: PatternSeam[];
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

function getPreviewTransform(
  piece: PatternPiece,
  index: number,
): PreviewTransform {
  const slot =
    DEFAULT_PREVIEW_TRANSFORMS[index % DEFAULT_PREVIEW_TRANSFORMS.length];

  return {
    position:
      piece.previewTransform?.position ??
      ([...slot.position] as [number, number, number]),

    rotation:
      piece.previewTransform?.rotation ??
      ([...slot.rotation] as [number, number, number]),

    scale: piece.previewTransform?.scale ?? [1, 1, 1],
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

function previewTransformToMatrix(transform: PreviewTransform) {
  const position = new THREE.Vector3(...transform.position);

  const rotation = new THREE.Euler(
    transform.rotation[0],
    transform.rotation[1],
    transform.rotation[2],
    "XYZ",
  );

  const quaternion = new THREE.Quaternion().setFromEuler(rotation);

  const scale = new THREE.Vector3(
    transform.scale?.[0] ?? 1,
    transform.scale?.[1] ?? 1,
    transform.scale?.[2] ?? 1,
  );

  return new THREE.Matrix4().compose(position, quaternion, scale);
}

function getEdgeSampleWorldPoint(
  piece: PatternPiece,
  edge: PatternEdgeSample,
  transform: PreviewTransform,
  patternUnitsPerMillimetre: number,
) {
  const point = getPatternEdgePoint(piece, edge.edge, edge.t);
  const centre = getPieceCentre(piece.points);

  const localPoint = new THREE.Vector3(
    ((point.x - centre.x) / patternUnitsPerMillimetre) * METRES_PER_MILLIMETRE,
    -((point.y - centre.y) / patternUnitsPerMillimetre) * METRES_PER_MILLIMETRE,
    0,
  );

  return localPoint.applyMatrix4(previewTransformToMatrix(transform));
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
    // nextGeometry.center();

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
      scale={transform.scale ?? [1, 1, 1]}
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
    scale: [object.scale.x, object.scale.y, object.scale.z],
  };
}

function SelectedPieceTransformGizmo({
  pieceId,
  object,
  mode,
  onCommitTransform,
}: {
  pieceId: string;
  object: THREE.Group | null;
  mode: TransformMode;
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
      mode={mode}
      space="world"
      size={0.75}
      translationSnap={0.01}
      rotationSnap={Math.PI / 12}
      onObjectChange={() => {
        isDraggingRef.current = true;
        pendingTransformRef.current = getTransformFromObject(object);
      }}
      onMouseUp={commitTransform}
    />
  );
}

function StitchConstraintDebug({
  constraints,
  cycleSeamIds,
  piecesById,
  transformsByPieceId,
  patternUnitsPerMillimetre,
}: {
  constraints: StitchConstraint[];
  cycleSeamIds: string[];
  piecesById: Map<string, PatternPiece>;
  transformsByPieceId: Map<string, PreviewTransform>;
  patternUnitsPerMillimetre: number;
}) {
  const geometry = useMemo(() => {
    const positions: number[] = [];

    for (const constraint of constraints) {
      /*
       * Hinged seams should already overlap, so they produce
       * zero-length lines. Show only unresolved loop seams.
       */
      if (!cycleSeamIds.includes(constraint.seamId)) {
        continue;
      }

      for (const sample of constraint.samples) {
        const pieceA = piecesById.get(sample.a.pieceId);
        const pieceB = piecesById.get(sample.b.pieceId);

        const transformA = transformsByPieceId.get(sample.a.pieceId);
        const transformB = transformsByPieceId.get(sample.b.pieceId);

        if (!pieceA || !pieceB || !transformA || !transformB) {
          continue;
        }

        const pointA = getEdgeSampleWorldPoint(
          pieceA,
          sample.a,
          transformA,
          patternUnitsPerMillimetre,
        );

        const pointB = getEdgeSampleWorldPoint(
          pieceB,
          sample.b,
          transformB,
          patternUnitsPerMillimetre,
        );

        positions.push(
          pointA.x,
          pointA.y,
          pointA.z,
          pointB.x,
          pointB.y,
          pointB.z,
        );
      }
    }

    const nextGeometry = new THREE.BufferGeometry();

    nextGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );

    return nextGeometry;
  }, [
    constraints,
    cycleSeamIds,
    patternUnitsPerMillimetre,
    piecesById,
    transformsByPieceId,
  ]);

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#ef4444" transparent opacity={0.9} />
    </lineSegments>
  );
}

function GarmentPreview({
  pieces,
  selectedPieceId,
  patternUnitsPerMillimetre,
  onSelectPiece,
  onUpdatePiecePreviewTransform,
  transformMode,
  onSelectedObjectChange,
  seams,
}: {
  pieces: PatternPiece[];
  selectedPieceId?: string | null;
  patternUnitsPerMillimetre: number;
  onSelectPiece?: (pieceId: string) => void;
  onUpdatePiecePreviewTransform: (
    pieceId: string,
    transform: PreviewTransform,
  ) => void;
  transformMode: TransformMode;
  onSelectedObjectChange?: (object: THREE.Group | null) => void;
  seams: PatternSeam[];
}) {
  const objectsByPieceIdRef = useRef(new Map<string, THREE.Group>());

  const [selectedObject, setSelectedObject] = useState<THREE.Group | null>(
    null,
  );

  useEffect(() => {
    onSelectedObjectChange?.(selectedObject);
  }, [onSelectedObjectChange, selectedObject]);

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

  const compiledGarment = useMemo(() => {
    const piecesWithResolvedDefaults = drawablePieces.map((piece, index) => ({
      ...piece,
      previewTransform: getPreviewTransform(piece, index),
    }));

    return compileGarment(
      piecesWithResolvedDefaults,
      seams,
      patternUnitsPerMillimetre,
    );
  }, [drawablePieces, seams, patternUnitsPerMillimetre]);

  const stitchConstraints = useMemo(
    () => compileStitchConstraints(drawablePieces, seams),
    [drawablePieces, seams],
  );

  const piecesById = useMemo(
    () => new Map(drawablePieces.map((piece) => [piece.id, piece])),
    [drawablePieces],
  );

  const transformsByPieceId = useMemo(() => {
    const nextTransforms = new Map<string, PreviewTransform>();

    for (const [index, piece] of drawablePieces.entries()) {
      nextTransforms.set(
        piece.id,
        compiledGarment.transformsByPieceId[piece.id] ??
          getPreviewTransform(piece, index),
      );
    }

    return nextTransforms;
  }, [compiledGarment.transformsByPieceId, drawablePieces]);

  return (
    <>
      <StitchConstraintDebug
        constraints={stitchConstraints}
        cycleSeamIds={compiledGarment.cycleSeamIds}
        piecesById={piecesById}
        transformsByPieceId={transformsByPieceId}
        patternUnitsPerMillimetre={patternUnitsPerMillimetre}
      />

      {drawablePieces.map((piece, index) => (
        <PatternPiecePanel
          key={piece.id}
          piece={piece}
          isSelected={piece.id === selectedPieceId}
          transform={
            compiledGarment.transformsByPieceId[piece.id] ??
            getPreviewTransform(piece, index)
          }
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
          mode={transformMode}
        />
      )}
    </>
  );
}

function getSymmetryLinkedPieces(
  pieces: PatternPiece[],
  selectedPiece: PatternPiece,
) {
  if (!selectedPiece.symmetry) {
    return [selectedPiece];
  }

  const partnerId = selectedPiece.symmetry.pairId;

  return pieces.filter((piece) => {
    return (
      piece.id === selectedPiece.id ||
      piece.id === partnerId ||
      piece.symmetry?.pairId === selectedPiece.id ||
      piece.symmetry?.pairId === partnerId
    );
  });
}

export function ThreePreview({
  modelUrl,
  pieces,
  selectedPieceId,
  patternUnitsPerMillimetre = 1,
  onSelectPiece,
  onUpdatePiecePreviewTransform,
  onClearSelection,
  onUpdatePiecePreviewTransforms,
  seams,
}: ThreePreviewProps) {
  const [transformMode, setTransformMode] =
    useState<TransformMode>("translate");

  const [hasSelectedPanelObject, setHasSelectedPanelObject] = useState(false);

  const handleSelectedObjectChange = useCallback(
    (object: THREE.Group | null) => {
      setHasSelectedPanelObject(object !== null);
    },
    [],
  );
  const selectedPiece = pieces.find((piece) => piece.id === selectedPieceId);

  const handleFlipSelectedPiece = useCallback(() => {
    if (!selectedPiece) {
      return;
    }

    const drawablePieces = pieces.filter((piece) => piece.points.length >= 3);

    const indexByPieceId = new Map(
      drawablePieces.map((piece, index) => [piece.id, index]),
    );

    const linkedPieces = getSymmetryLinkedPieces(drawablePieces, selectedPiece);

    const updates: PiecePreviewTransformUpdate[] = linkedPieces.map((piece) => {
      const index = indexByPieceId.get(piece.id) ?? 0;
      const transform = getPreviewTransform(piece, index);

      return {
        pieceId: piece.id,
        previewTransform: {
          ...transform,
          scale: [
            -(transform.scale?.[0] ?? 1),
            transform.scale?.[1] ?? 1,
            transform.scale?.[2] ?? 1,
          ],
        },
      };
    });

    onUpdatePiecePreviewTransforms(updates);
  }, [onUpdatePiecePreviewTransforms, pieces, selectedPiece]);

  return (
    <div className="three-preview">
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

          <AvatarModel
            onClearSelection={onClearSelection}
            modelUrl={modelUrl}
          />

          <GarmentPreview
            pieces={pieces}
            selectedPieceId={selectedPieceId}
            patternUnitsPerMillimetre={patternUnitsPerMillimetre}
            onSelectPiece={onSelectPiece}
            onUpdatePiecePreviewTransform={onUpdatePiecePreviewTransform}
            transformMode={transformMode}
            onSelectedObjectChange={handleSelectedObjectChange}
            seams={seams}
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

      {selectedPiece && hasSelectedPanelObject && (
        <div
          className="three-toolbar"
          role="toolbar"
          aria-label="3D pattern piece tools"
        >
          <span className="three-toolbar__name">{selectedPiece.name}</span>

          <button
            className={transformMode === "translate" ? "active" : ""}
            type="button"
            onClick={() => setTransformMode("translate")}
          >
            Move
          </button>

          <button
            className={transformMode === "rotate" ? "active" : ""}
            type="button"
            onClick={() => setTransformMode("rotate")}
          >
            Rotate
          </button>
          <button type="button" onClick={handleFlipSelectedPiece}>
            Flip
          </button>
        </div>
      )}
    </div>
  );
}
