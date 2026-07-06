import * as THREE from "three";

import type {
  PatternEdgeRef,
  PatternPiece,
  PatternPoint,
  PatternSeam,
  PreviewTransform,
} from "../types";

const METRES_PER_MILLIMETRE = 0.001;
const DEFAULT_FOLD_ANGLE = Math.PI / 2;

type CompiledGarmentComponent = {
  rootPieceId: string;
  pieceIds: string[];
  seamIds: string[];
};

export type CompiledGarment = {
  transformsByPieceId: Record<string, PreviewTransform>;
  components: CompiledGarmentComponent[];
  cycleSeamIds: string[];
};

function getPieceCentre(points: PatternPoint[]) {
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

function getPointById(piece: PatternPiece, pointId: string) {
  const point = piece.points.find((candidate) => candidate.id === pointId);

  if (!point) {
    throw new Error(
      `Could not find point "${pointId}" on piece "${piece.id}".`,
    );
  }

  return point;
}

/*
 * This MUST match createPatternShape() in ThreePreview.
 *
 * A 2D point becomes a local 3D point in the panel's XY plane.
 */
function getPanelLocalPoint(
  piece: PatternPiece,
  pointId: string,
  patternUnitsPerMillimetre: number,
) {
  const point = getPointById(piece, pointId);
  const centre = getPieceCentre(piece.points);

  return new THREE.Vector3(
    ((point.x - centre.x) / patternUnitsPerMillimetre) * METRES_PER_MILLIMETRE,
    -((point.y - centre.y) / patternUnitsPerMillimetre) * METRES_PER_MILLIMETRE,
    0,
  );
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

function matrixToPreviewTransform(matrix: THREE.Matrix4): PreviewTransform {
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  matrix.decompose(position, quaternion, scale);

  const rotation = new THREE.Euler().setFromQuaternion(quaternion, "XYZ");

  return {
    position: [position.x, position.y, position.z],
    rotation: [rotation.x, rotation.y, rotation.z],
    scale: [scale.x, scale.y, scale.z],
  };
}

/*
 * Creates a coordinate system centred on a seam line:
 *
 * X = direction along the seam
 * Y = direction across the panel
 * Z = panel normal
 */
function makeEdgeFrame(
  start: THREE.Vector3,
  end: THREE.Vector3,
  normal: THREE.Vector3,
) {
  const xAxis = new THREE.Vector3().subVectors(end, start).normalize();

  const zAxis = normal.clone().normalize();

  const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();

  const correctedZAxis = new THREE.Vector3()
    .crossVectors(xAxis, yAxis)
    .normalize();

  return new THREE.Matrix4()
    .makeBasis(xAxis, yAxis, correctedZAxis)
    .setPosition(start);
}

function makeHingeRotation(
  seamStart: THREE.Vector3,
  seamEnd: THREE.Vector3,
  angleRad: number,
) {
  const seamAxis = new THREE.Vector3()
    .subVectors(seamEnd, seamStart)
    .normalize();

  const moveToOrigin = new THREE.Matrix4().makeTranslation(
    -seamStart.x,
    -seamStart.y,
    -seamStart.z,
  );

  const rotate = new THREE.Matrix4().makeRotationAxis(seamAxis, angleRad);

  const moveBack = new THREE.Matrix4().makeTranslation(
    seamStart.x,
    seamStart.y,
    seamStart.z,
  );

  return moveBack.multiply(rotate).multiply(moveToOrigin);
}

function getOtherPieceId(seam: PatternSeam, currentPieceId: string) {
  if (seam.edgeA.pieceId === currentPieceId) {
    return seam.edgeB.pieceId;
  }

  if (seam.edgeB.pieceId === currentPieceId) {
    return seam.edgeA.pieceId;
  }

  return null;
}

function getEdgeForPiece(
  seam: PatternSeam,
  pieceId: string,
): PatternEdgeRef | null {
  if (seam.edgeA.pieceId === pieceId) {
    return seam.edgeA;
  }

  if (seam.edgeB.pieceId === pieceId) {
    return seam.edgeB;
  }

  return null;
}

/*
 * Calculates the transform for childPiece so its chosen seam edge:
 *
 * - lands on parentPiece's seam edge
 * - follows reverseEdgeB
 * - folds around that edge by the seam angle
 */
function attachChildThroughSeam({
  seam,
  parentPiece,
  childPiece,
  parentMatrix,
  patternUnitsPerMillimetre,
}: {
  seam: PatternSeam;
  parentPiece: PatternPiece;
  childPiece: PatternPiece;
  parentMatrix: THREE.Matrix4;
  patternUnitsPerMillimetre: number;
}) {
  const parentEdge = getEdgeForPiece(seam, parentPiece.id);
  const childEdge = getEdgeForPiece(seam, childPiece.id);

  if (!parentEdge || !childEdge) {
    throw new Error(`Invalid seam "${seam.id}".`);
  }

  const parentStartLocal = getPanelLocalPoint(
    parentPiece,
    parentEdge.startPointId,
    patternUnitsPerMillimetre,
  );

  const parentEndLocal = getPanelLocalPoint(
    parentPiece,
    parentEdge.endPointId,
    patternUnitsPerMillimetre,
  );

  /*
   * reverseEdgeB means:
   *
   * A start ↔ B end
   * A end   ↔ B start
   *
   * So whichever piece is the child, reverse its local
   * seam direction before attaching it to the parent direction.
   */
  const childStartId = seam.reverseEdgeB
    ? childEdge.endPointId
    : childEdge.startPointId;

  const childEndId = seam.reverseEdgeB
    ? childEdge.startPointId
    : childEdge.endPointId;

  const childStartLocal = getPanelLocalPoint(
    childPiece,
    childStartId,
    patternUnitsPerMillimetre,
  );

  const childEndLocal = getPanelLocalPoint(
    childPiece,
    childEndId,
    patternUnitsPerMillimetre,
  );

  const parentStartWorld = parentStartLocal.clone().applyMatrix4(parentMatrix);

  const parentEndWorld = parentEndLocal.clone().applyMatrix4(parentMatrix);

  const parentNormalWorld = new THREE.Vector3(0, 0, 1)
    .transformDirection(parentMatrix)
    .normalize();

  const childNormalLocal = new THREE.Vector3(0, 0, 1);

  const parentFrame = makeEdgeFrame(
    parentStartWorld,
    parentEndWorld,
    parentNormalWorld,
  );

  const childFrame = makeEdgeFrame(
    childStartLocal,
    childEndLocal,
    childNormalLocal,
  );

  /*
   * Align child seam to parent seam.
   *
   * childFrame^-1 moves child seam to origin/orientation.
   * parentFrame places it onto the parent's seam.
   */
  const alignedChildMatrix = parentFrame
    .clone()
    .multiply(childFrame.clone().invert());

  const foldAngle =
    (seam.foldAngleRad ?? DEFAULT_FOLD_ANGLE) * (seam.foldDirection ?? 1);

  const hingeMatrix = makeHingeRotation(
    parentStartWorld,
    parentEndWorld,
    foldAngle,
  );

  return hingeMatrix.multiply(alignedChildMatrix);
}

export function compileGarment(
  pieces: PatternPiece[],
  seams: PatternSeam[],
  patternUnitsPerMillimetre: number,
): CompiledGarment {
  const piecesById = new Map(pieces.map((piece) => [piece.id, piece]));

  const seamsByPieceId = new Map<string, PatternSeam[]>();

  for (const seam of seams) {
    if (
      !piecesById.has(seam.edgeA.pieceId) ||
      !piecesById.has(seam.edgeB.pieceId)
    ) {
      continue;
    }

    const seamsForA = seamsByPieceId.get(seam.edgeA.pieceId) ?? [];
    seamsForA.push(seam);
    seamsByPieceId.set(seam.edgeA.pieceId, seamsForA);

    const seamsForB = seamsByPieceId.get(seam.edgeB.pieceId) ?? [];
    seamsForB.push(seam);
    seamsByPieceId.set(seam.edgeB.pieceId, seamsForB);
  }

  const resolvedMatrices = new Map<string, THREE.Matrix4>();
  const transformsByPieceId: Record<string, PreviewTransform> = {};

  const components: CompiledGarmentComponent[] = [];
  const cycleSeamIds: string[] = [];

  const visitedPieceIds = new Set<string>();

  for (const firstPiece of pieces) {
    if (visitedPieceIds.has(firstPiece.id)) {
      continue;
    }

    /*
     * Find every piece connected by seams.
     */
    const componentPieceIds: string[] = [];
    const componentVisitQueue = [firstPiece.id];
    const componentPieceIdSet = new Set<string>([firstPiece.id]);

    while (componentVisitQueue.length > 0) {
      const pieceId = componentVisitQueue.shift();

      if (!pieceId) {
        continue;
      }

      componentPieceIds.push(pieceId);
      visitedPieceIds.add(pieceId);

      const connectedSeams = seamsByPieceId.get(pieceId) ?? [];

      for (const seam of connectedSeams) {
        const otherPieceId = getOtherPieceId(seam, pieceId);

        if (!otherPieceId || componentPieceIdSet.has(otherPieceId)) {
          continue;
        }

        componentPieceIdSet.add(otherPieceId);
        componentVisitQueue.push(otherPieceId);
      }
    }

    /*
     * For now, first-created piece becomes the stable root.
     *
     * Later: let the user pin a garment root explicitly.
     */
    const rootPieceId = componentPieceIds[0];
    const rootPiece = piecesById.get(rootPieceId);

    if (!rootPiece) {
      continue;
    }

    const rootTransform = rootPiece.previewTransform ?? {
      position: [0, 1.2, 0.36],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    };

    resolvedMatrices.set(rootPieceId, previewTransformToMatrix(rootTransform));

    const usedSeamIds = new Set<string>();
    const assemblyQueue = [rootPieceId];

    while (assemblyQueue.length > 0) {
      const parentPieceId = assemblyQueue.shift();

      if (!parentPieceId) {
        continue;
      }

      const parentPiece = piecesById.get(parentPieceId);
      const parentMatrix = resolvedMatrices.get(parentPieceId);

      if (!parentPiece || !parentMatrix) {
        continue;
      }

      const connectedSeams = seamsByPieceId.get(parentPieceId) ?? [];

      for (const seam of connectedSeams) {
        if (usedSeamIds.has(seam.id)) {
          continue;
        }

        const childPieceId = getOtherPieceId(seam, parentPieceId);

        if (!childPieceId) {
          continue;
        }

        /*
         * This seam closes a loop, for example the second
         * side seam of a torso. A rigid hinge assembly cannot
         * satisfy every loop yet, so leave it for cloth simulation.
         */
        if (resolvedMatrices.has(childPieceId)) {
          cycleSeamIds.push(seam.id);
          continue;
        }

        console.log(cycleSeamIds);

        const childPiece = piecesById.get(childPieceId);

        if (!childPiece) {
          continue;
        }

        const childMatrix = attachChildThroughSeam({
          seam,
          parentPiece,
          childPiece,
          parentMatrix,
          patternUnitsPerMillimetre,
        });

        resolvedMatrices.set(childPieceId, childMatrix);
        usedSeamIds.add(seam.id);
        assemblyQueue.push(childPieceId);
      }
    }

    components.push({
      rootPieceId,
      pieceIds: componentPieceIds,
      seamIds: [...usedSeamIds],
    });
  }

  for (const piece of pieces) {
    const matrix = resolvedMatrices.get(piece.id);

    if (!matrix) {
      continue;
    }

    transformsByPieceId[piece.id] = matrixToPreviewTransform(matrix);
  }

  return {
    transformsByPieceId,
    components,
    cycleSeamIds,
  };
}
