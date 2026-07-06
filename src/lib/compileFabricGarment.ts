import * as THREE from "three";

import { getSegmentLength } from "./geometry";
import { getPatternEdgePoint } from "./compileStitchConstraints";
import type { CompiledGarment } from "./compileGarment";

import type {
  PatternEdgeRef,
  PatternPiece,
  PatternSeam,
  PreviewTransform,
} from "../types";

const METRES_PER_MILLIMETRE = 0.001;

const DEFAULT_EDGE_SAMPLE_SPACING_MM = 25;
const STITCH_SAMPLE_SPACING_MM = 20;

export type FabricPanelTopology = {
  pieceId: string;
  particleStart: number;
  particleCount: number;

  /*
   * Triangle indices local to this panel.
   */
  indices: Uint32Array;

  /*
   * Each original pattern edge maps to actual fabric particles.
   * The IDs are global particle IDs in the garment.
   */
  edgeParticleIdsByKey: Record<string, number[]>;

  isPinned: boolean;
};

export type DistanceConstraint = {
  a: number;
  b: number;
  restLength: number;
  stiffness: number;
};

export type FabricStitchConstraint = {
  seamId: string;
  a: number;
  b: number;
  stiffness: number;
};

export type CompiledFabricGarment = {
  panels: FabricPanelTopology[];

  /*
   * World-space particle positions before relaxation.
   */
  restPositions: Float32Array;

  /*
   * Preserve triangle edge lengths.
   */
  distanceConstraints: DistanceConstraint[];

  /*
   * Pull sewn edge particles together.
   */
  stitchConstraints: FabricStitchConstraint[];

  /*
   * For this first solver version, hold each component root
   * panel in place while connected panels relax around it.
   */
  pinnedParticleIds: number[];
};

type BoundaryEdgeRecord = {
  edge: PatternEdgeRef;
  startLocalIndex: number;
  segmentCount: number;
};

function edgeKey(
  pieceId: string,
  startPointId: string,
  endPointId: string,
) {
  const [firstPointId, secondPointId] = [startPointId, endPointId].sort();

  return `${pieceId}:${firstPointId}:${secondPointId}`;
}

function getPieceCentre(piece: PatternPiece) {
  const total = piece.points.reduce(
    (current, point) => ({
      x: current.x + point.x,
      y: current.y + point.y,
    }),
    { x: 0, y: 0 },
  );

  return {
    x: total.x / piece.points.length,
    y: total.y / piece.points.length,
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

function getPieceEdgeLength(
  piece: PatternPiece,
  edge: PatternEdgeRef,
) {
  return getSegmentLength(
    getPointById(piece, edge.startPointId),
    getPointById(piece, edge.endPointId),
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

function getPanelLocalPoint(
  piece: PatternPiece,
  point: { x: number; y: number },
  patternUnitsPerMillimetre: number,
) {
  const centre = getPieceCentre(piece);

  return new THREE.Vector2(
    ((point.x - centre.x) / patternUnitsPerMillimetre) *
      METRES_PER_MILLIMETRE,
    -((point.y - centre.y) / patternUnitsPerMillimetre) *
      METRES_PER_MILLIMETRE,
  );
}

function getSeamSampleCounts(
  piecesById: Map<string, PatternPiece>,
  seams: PatternSeam[],
) {
  const sampleCountsByEdgeKey = new Map<string, number>();

  for (const seam of seams) {
    const pieceA = piecesById.get(seam.edgeA.pieceId);
    const pieceB = piecesById.get(seam.edgeB.pieceId);

    if (!pieceA || !pieceB) {
      continue;
    }

    const longestEdgeMm = Math.max(
      getPieceEdgeLength(pieceA, seam.edgeA),
      getPieceEdgeLength(pieceB, seam.edgeB),
    );

    const sampleCount = Math.max(
      3,
      Math.ceil(longestEdgeMm / STITCH_SAMPLE_SPACING_MM) + 1,
    );

    const edgeAKey = edgeKey(
      seam.edgeA.pieceId,
      seam.edgeA.startPointId,
      seam.edgeA.endPointId,
    );

    const edgeBKey = edgeKey(
      seam.edgeB.pieceId,
      seam.edgeB.startPointId,
      seam.edgeB.endPointId,
    );

    sampleCountsByEdgeKey.set(edgeAKey, sampleCount);
    sampleCountsByEdgeKey.set(edgeBKey, sampleCount);
  }

  return sampleCountsByEdgeKey;
}

function buildPanelBoundary({
  piece,
  particleStart,
  patternUnitsPerMillimetre,
  seamSampleCountsByEdgeKey,
}: {
  piece: PatternPiece;
  particleStart: number;
  patternUnitsPerMillimetre: number;
  seamSampleCountsByEdgeKey: Map<string, number>;
}) {
  const contour: THREE.Vector2[] = [];
  const edgeRecords: BoundaryEdgeRecord[] = [];

  for (let index = 0; index < piece.points.length; index += 1) {
    const start = piece.points[index];
    const end = piece.points[(index + 1) % piece.points.length];

    const edge: PatternEdgeRef = {
      pieceId: piece.id,
      startPointId: start.id,
      endPointId: end.id,
    };

    const key = edgeKey(piece.id, start.id, end.id);

    const defaultSampleCount = Math.max(
      2,
      Math.ceil(
        getSegmentLength(start, end) / DEFAULT_EDGE_SAMPLE_SPACING_MM,
      ) + 1,
    );

    const sampleCount =
      seamSampleCountsByEdgeKey.get(key) ?? defaultSampleCount;

    const segmentCount = sampleCount - 1;
    const startLocalIndex = contour.length;

    /*
     * Add the start point plus any interior points.
     * The next edge contributes this edge's final endpoint,
     * so we do not duplicate it here.
     */
    for (
      let sampleIndex = 0;
      sampleIndex < segmentCount;
      sampleIndex += 1
    ) {
      const t = sampleIndex / segmentCount;

      const point = getPatternEdgePoint(piece, edge, t);

      contour.push(
        getPanelLocalPoint(
          piece,
          point,
          patternUnitsPerMillimetre,
        ),
      );
    }

    edgeRecords.push({
      edge,
      startLocalIndex,
      segmentCount,
    });
  }

  if (contour.length < 3) {
    throw new Error(
      `Piece "${piece.id}" does not have enough boundary points.`,
    );
  }

  const triangles = THREE.ShapeUtils.triangulateShape(contour, []);

  const edgeParticleIdsByKey: Record<string, number[]> = {};

  for (let index = 0; index < edgeRecords.length; index += 1) {
    const record = edgeRecords[index];
    const nextRecord =
      edgeRecords[(index + 1) % edgeRecords.length];

    const particleIds = Array.from(
      { length: record.segmentCount + 1 },
      (_, sampleIndex) => {
        const localIndex =
          sampleIndex === record.segmentCount
            ? nextRecord.startLocalIndex
            : record.startLocalIndex + sampleIndex;

        return particleStart + localIndex;
      },
    );

    edgeParticleIdsByKey[
      edgeKey(
        record.edge.pieceId,
        record.edge.startPointId,
        record.edge.endPointId,
      )
    ] = particleIds;
  }

  return {
    contour,
    indices: new Uint32Array(triangles.flat()),
    edgeParticleIdsByKey,
  };
}

function getDistance(
  positions: number[],
  a: number,
  b: number,
) {
  const aOffset = a * 3;
  const bOffset = b * 3;

  const dx = positions[bOffset] - positions[aOffset];
  const dy = positions[bOffset + 1] - positions[aOffset + 1];
  const dz = positions[bOffset + 2] - positions[aOffset + 2];

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function compileFabricGarment(
  pieces: PatternPiece[],
  seams: PatternSeam[],
  compiledGarment: CompiledGarment,
  patternUnitsPerMillimetre: number,
): CompiledFabricGarment {
  const piecesById = new Map(
    pieces.map((piece) => [piece.id, piece]),
  );

  const rootPieceIds = new Set(
    compiledGarment.components.map(
      (component) => component.rootPieceId,
    ),
  );

  const seamSampleCountsByEdgeKey = getSeamSampleCounts(
    piecesById,
    seams,
  );

  const panels: FabricPanelTopology[] = [];
  const restPositionValues: number[] = [];
  const pinnedParticleIds: number[] = [];

  let nextParticleId = 0;

  for (const piece of pieces) {
    const transform =
      compiledGarment.transformsByPieceId[piece.id];

    if (!transform) {
      continue;
    }

    const panelBoundary = buildPanelBoundary({
      piece,
      particleStart: nextParticleId,
      patternUnitsPerMillimetre,
      seamSampleCountsByEdgeKey,
    });

    const matrix = previewTransformToMatrix(transform);

    for (const localPoint of panelBoundary.contour) {
      const worldPoint = new THREE.Vector3(
        localPoint.x,
        localPoint.y,
        0,
      ).applyMatrix4(matrix);

      restPositionValues.push(
        worldPoint.x,
        worldPoint.y,
        worldPoint.z,
      );
    }

    const panel: FabricPanelTopology = {
      pieceId: piece.id,
      particleStart: nextParticleId,
      particleCount: panelBoundary.contour.length,
      indices: panelBoundary.indices,
      edgeParticleIdsByKey: panelBoundary.edgeParticleIdsByKey,
      isPinned: rootPieceIds.has(piece.id),
    };

    panels.push(panel);

    if (panel.isPinned) {
      for (
        let index = 0;
        index < panel.particleCount;
        index += 1
      ) {
        pinnedParticleIds.push(panel.particleStart + index);
      }
    }

    nextParticleId += panel.particleCount;
  }

  const distanceConstraints: DistanceConstraint[] = [];
  const distanceConstraintKeys = new Set<string>();

  for (const panel of panels) {
    for (
      let index = 0;
      index < panel.indices.length;
      index += 3
    ) {
      const triangle = [
        panel.particleStart + panel.indices[index],
        panel.particleStart + panel.indices[index + 1],
        panel.particleStart + panel.indices[index + 2],
      ] as const;

      const triangleEdges = [
        [triangle[0], triangle[1]],
        [triangle[1], triangle[2]],
        [triangle[2], triangle[0]],
      ] as const;

      for (const [a, b] of triangleEdges) {
        const key = a < b ? `${a}:${b}` : `${b}:${a}`;

        if (distanceConstraintKeys.has(key)) {
          continue;
        }

        distanceConstraintKeys.add(key);

        distanceConstraints.push({
          a,
          b,
          restLength: getDistance(restPositionValues, a, b),
          stiffness: 1,
        });
      }
    }
  }

  const panelsByPieceId = new Map(
    panels.map((panel) => [panel.pieceId, panel]),
  );

  const stitchConstraints: FabricStitchConstraint[] = [];

  for (const seam of seams) {
    const panelA = panelsByPieceId.get(seam.edgeA.pieceId);
    const panelB = panelsByPieceId.get(seam.edgeB.pieceId);

    if (!panelA || !panelB) {
      continue;
    }

    const edgeAParticleIds =
      panelA.edgeParticleIdsByKey[
        edgeKey(
          seam.edgeA.pieceId,
          seam.edgeA.startPointId,
          seam.edgeA.endPointId,
        )
      ];

    const edgeBParticleIds =
      panelB.edgeParticleIdsByKey[
        edgeKey(
          seam.edgeB.pieceId,
          seam.edgeB.startPointId,
          seam.edgeB.endPointId,
        )
      ];

    if (!edgeAParticleIds || !edgeBParticleIds) {
      continue;
    }

    const pairCount = Math.min(
      edgeAParticleIds.length,
      edgeBParticleIds.length,
    );

    for (let index = 0; index < pairCount; index += 1) {
      const edgeBIndex = seam.reverseEdgeB
        ? pairCount - 1 - index
        : index;

      stitchConstraints.push({
        seamId: seam.id,
        a: edgeAParticleIds[index],
        b: edgeBParticleIds[edgeBIndex],
        stiffness: 1,
      });
    }
  }

  return {
    panels,
    restPositions: new Float32Array(restPositionValues),
    distanceConstraints,
    stitchConstraints,
    pinnedParticleIds,
  };
}