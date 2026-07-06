import * as THREE from "three";

import { getSegmentLength } from "./geometry";
import { getPatternEdgePoint } from "./compileStitchConstraints";
import type { CompiledGarment } from "./compileGarment";

import Constrainautor from "@kninnug/constrainautor";
import Delaunator from "delaunator";

import type {
  PatternEdgeRef,
  PatternPiece,
  PatternSeam,
  PreviewTransform,
} from "../types";

const METRES_PER_MILLIMETRE = 0.001;

const DEFAULT_EDGE_SAMPLE_SPACING_MM = 25;
const STITCH_SAMPLE_SPACING_MM = 20;

const INTERIOR_PARTICLE_SPACING_MM = 25;
const INTERIOR_PARTICLE_SPACING_METRES =
  INTERIOR_PARTICLE_SPACING_MM * METRES_PER_MILLIMETRE;

const INTERIOR_BOUNDARY_CLEARANCE = INTERIOR_PARTICLE_SPACING_METRES * 0.22;

const DEFAULT_BEND_STIFFNESS = 0.05;

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

  boundaryParticleIds: number[];
};

export type DistanceConstraint = {
  a: number;
  b: number;
  restLength: number;
  stiffness: number;
};

export type BendConstraint = {
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

  bendConstraints: BendConstraint[];
};

type BoundaryEdgeRecord = {
  edge: PatternEdgeRef;
  startLocalIndex: number;
  segmentCount: number;
};

function edgeKey(pieceId: string, startPointId: string, endPointId: string) {
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

function getPieceEdgeLength(piece: PatternPiece, edge: PatternEdgeRef) {
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
    ((point.x - centre.x) / patternUnitsPerMillimetre) * METRES_PER_MILLIMETRE,
    -((point.y - centre.y) / patternUnitsPerMillimetre) * METRES_PER_MILLIMETRE,
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

function isPointInsidePolygon(
  point: THREE.Vector2,
  polygon: readonly THREE.Vector2[],
) {
  let isInside = false;

  for (
    let currentIndex = 0, previousIndex = polygon.length - 1;
    currentIndex < polygon.length;
    previousIndex = currentIndex++
  ) {
    const current = polygon[currentIndex];
    const previous = polygon[previousIndex];

    const crossesHorizontalRay = current.y > point.y !== previous.y > point.y;

    if (!crossesHorizontalRay) {
      continue;
    }

    const rayIntersectionX =
      ((previous.x - current.x) * (point.y - current.y)) /
        (previous.y - current.y) +
      current.x;

    if (point.x < rayIntersectionX) {
      isInside = !isInside;
    }
  }

  return isInside;
}

function getDistanceToSegment(
  point: THREE.Vector2,
  start: THREE.Vector2,
  end: THREE.Vector2,
) {
  const direction = end.clone().sub(start);
  const lengthSquared = direction.lengthSq();

  if (lengthSquared === 0) {
    return point.distanceTo(start);
  }

  const projectedProgress = Math.max(
    0,
    Math.min(1, point.clone().sub(start).dot(direction) / lengthSquared),
  );

  const closestPoint = start
    .clone()
    .add(direction.multiplyScalar(projectedProgress));

  return point.distanceTo(closestPoint);
}

function getDistanceToPolygonBoundary(
  point: THREE.Vector2,
  polygon: readonly THREE.Vector2[],
) {
  let minimumDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];

    minimumDistance = Math.min(
      minimumDistance,
      getDistanceToSegment(point, start, end),
    );
  }

  return minimumDistance;
}

function buildInteriorLatticePoints(contour: readonly THREE.Vector2[]) {
  const bounds = new THREE.Box2();

  for (const point of contour) {
    bounds.expandByPoint(point);
  }

  const points: THREE.Vector2[] = [];

  /*
   * Triangular lattice gives better cloth triangles than
   * a plain square grid.
   */
  const rowStep = INTERIOR_PARTICLE_SPACING_METRES * (Math.sqrt(3) / 2);

  let rowIndex = 0;

  for (
    let y = bounds.min.y + INTERIOR_PARTICLE_SPACING_METRES / 2;
    y < bounds.max.y;
    y += rowStep
  ) {
    const rowOffset =
      rowIndex % 2 === 0 ? 0 : INTERIOR_PARTICLE_SPACING_METRES / 2;

    for (
      let x = bounds.min.x + INTERIOR_PARTICLE_SPACING_METRES / 2 + rowOffset;
      x < bounds.max.x;
      x += INTERIOR_PARTICLE_SPACING_METRES
    ) {
      const candidate = new THREE.Vector2(x, y);

      if (!isPointInsidePolygon(candidate, contour)) {
        continue;
      }

      /*
       * Keeps grid particles away from boundary lines.
       * This prevents near-duplicate vertices and avoids
       * invalid constrained edges.
       */
      if (
        getDistanceToPolygonBoundary(candidate, contour) <
        INTERIOR_BOUNDARY_CLEARANCE
      ) {
        continue;
      }

      points.push(candidate);
    }

    rowIndex += 1;
  }

  return points;
}

function triangleIsInsidePattern(
  vertices: readonly THREE.Vector2[],
  a: number,
  b: number,
  c: number,
  contour: readonly THREE.Vector2[],
) {
  const centroid = vertices[a]
    .clone()
    .add(vertices[b])
    .add(vertices[c])
    .multiplyScalar(1 / 3);

  return isPointInsidePolygon(centroid, contour);
}

function buildPanelMesh({
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
      Math.ceil(getSegmentLength(start, end) / DEFAULT_EDGE_SAMPLE_SPACING_MM) +
        1,
    );

    const sampleCount =
      seamSampleCountsByEdgeKey.get(key) ?? defaultSampleCount;

    const segmentCount = sampleCount - 1;
    const startLocalIndex = contour.length;

    for (let sampleIndex = 0; sampleIndex < segmentCount; sampleIndex += 1) {
      const t = sampleIndex / segmentCount;

      const point = getPatternEdgePoint(piece, edge, t);

      contour.push(getPanelLocalPoint(piece, point, patternUnitsPerMillimetre));
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

  const interiorPoints = buildInteriorLatticePoints(contour);

  /*
   * Boundary vertices remain first.
   * This is important because seam-edge particle IDs depend on them.
   */
  const vertices = [...contour, ...interiorPoints];

  const boundaryConstraints: Array<[number, number]> = contour.map(
    (_, index) => [index, (index + 1) % contour.length],
  );

  const delaunay = Delaunator.from(
    vertices,
    (point) => point.x,
    (point) => point.y,
  );

  /*
   * Forces every sampled pattern boundary edge to exist
   * in the final triangle topology.
   */
  new Constrainautor(delaunay, boundaryConstraints);

  const triangleIndices: number[] = [];

  for (
    let triangleOffset = 0;
    triangleOffset < delaunay.triangles.length;
    triangleOffset += 3
  ) {
    const a = delaunay.triangles[triangleOffset];
    const b = delaunay.triangles[triangleOffset + 1];
    const c = delaunay.triangles[triangleOffset + 2];

    if (!triangleIsInsidePattern(vertices, a, b, c, contour)) {
      continue;
    }

    triangleIndices.push(a, b, c);
  }

  const edgeParticleIdsByKey: Record<string, number[]> = {};

  for (let index = 0; index < edgeRecords.length; index += 1) {
    const record = edgeRecords[index];
    const nextRecord = edgeRecords[(index + 1) % edgeRecords.length];

    edgeParticleIdsByKey[
      edgeKey(
        record.edge.pieceId,
        record.edge.startPointId,
        record.edge.endPointId,
      )
    ] = Array.from({ length: record.segmentCount + 1 }, (_, sampleIndex) => {
      const localIndex =
        sampleIndex === record.segmentCount
          ? nextRecord.startLocalIndex
          : record.startLocalIndex + sampleIndex;

      return particleStart + localIndex;
    });
  }

  const boundaryParticleIds = Array.from(
    { length: contour.length },
    (_, localParticleId) => particleStart + localParticleId,
  );

  return {
    vertices,
    indices: new Uint32Array(triangleIndices),
    edgeParticleIdsByKey,
    boundaryParticleIds,
  };
}

function getDistance(positions: number[], a: number, b: number) {
  const aOffset = a * 3;
  const bOffset = b * 3;

  const dx = positions[bOffset] - positions[aOffset];
  const dy = positions[bOffset + 1] - positions[aOffset + 1];
  const dz = positions[bOffset + 2] - positions[aOffset + 2];

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

const ANCHOR_TOP_BAND_METRES = 0.09;

function getParticleY(positions: number[] | Float32Array, particleId: number) {
  return positions[particleId * 3 + 1];
}

function getHorizontalDistanceSquared(
  positions: number[] | Float32Array,
  firstParticleId: number,
  secondParticleId: number,
) {
  const firstOffset = firstParticleId * 3;
  const secondOffset = secondParticleId * 3;

  const deltaX = positions[firstOffset] - positions[secondOffset];

  const deltaZ = positions[firstOffset + 2] - positions[secondOffset + 2];

  return deltaX * deltaX + deltaZ * deltaZ;
}

/*
 * Picks two high boundary particles on the root panel.
 *
 * They act like simple shoulder / neckline attachment points:
 * enough to hold the garment up, but not enough to freeze
 * the complete panel.
 */
function getRootAnchorParticleIds(
  panel: FabricPanelTopology,
  restPositions: number[] | Float32Array,
) {
  const boundaryParticleIds = [...new Set(panel.boundaryParticleIds)];

  if (boundaryParticleIds.length <= 2) {
    return boundaryParticleIds;
  }

  const sortedByHeight = [...boundaryParticleIds].sort(
    (firstParticleId, secondParticleId) =>
      getParticleY(restPositions, secondParticleId) -
      getParticleY(restPositions, firstParticleId),
  );

  const firstAnchorId = sortedByHeight[0];
  const firstAnchorY = getParticleY(restPositions, firstAnchorId);

  let secondAnchorId: number | null = null;
  let greatestHorizontalDistance = -1;

  for (const candidateParticleId of sortedByHeight) {
    if (candidateParticleId === firstAnchorId) {
      continue;
    }

    const candidateY = getParticleY(restPositions, candidateParticleId);

    /*
     * Prefer another point close to the top of the panel.
     * This keeps anchors around shoulders / neckline rather
     * than grabbing a point near the waist.
     */
    if (candidateY < firstAnchorY - ANCHOR_TOP_BAND_METRES) {
      continue;
    }

    const horizontalDistance = getHorizontalDistanceSquared(
      restPositions,
      firstAnchorId,
      candidateParticleId,
    );

    if (horizontalDistance > greatestHorizontalDistance) {
      greatestHorizontalDistance = horizontalDistance;
      secondAnchorId = candidateParticleId;
    }
  }

  /*
   * Narrow or asymmetric panels may have only one point in
   * the top band, so fall back to the second-highest point.
   */
  return secondAnchorId === null
    ? [firstAnchorId, sortedByHeight[1]]
    : [firstAnchorId, secondAnchorId];
}

type SharedEdgeRecord = {
  oppositeParticleId: number;
};

function getConstraintEdgeKey(a: number, b: number) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function compileFabricGarment(
  pieces: PatternPiece[],
  seams: PatternSeam[],
  compiledGarment: CompiledGarment,
  patternUnitsPerMillimetre: number,
): CompiledFabricGarment {
  const piecesById = new Map(pieces.map((piece) => [piece.id, piece]));

  const rootPieceIds = new Set(
    compiledGarment.components.map((component) => component.rootPieceId),
  );

  const seamSampleCountsByEdgeKey = getSeamSampleCounts(piecesById, seams);

  const panels: FabricPanelTopology[] = [];
  const restPositionValues: number[] = [];

  let nextParticleId = 0;

  for (const piece of pieces) {
    const transform = compiledGarment.transformsByPieceId[piece.id];

    if (!transform) {
      continue;
    }

    const panelMesh = buildPanelMesh({
      piece,
      particleStart: nextParticleId,
      patternUnitsPerMillimetre,
      seamSampleCountsByEdgeKey,
    });

    const matrix = previewTransformToMatrix(transform);

    for (const localPoint of panelMesh.vertices) {
      const worldPoint = new THREE.Vector3(
        localPoint.x,
        localPoint.y,
        0,
      ).applyMatrix4(matrix);

      restPositionValues.push(worldPoint.x, worldPoint.y, worldPoint.z);
    }

    const panel: FabricPanelTopology = {
      pieceId: piece.id,
      particleStart: nextParticleId,
      particleCount: panelMesh.vertices.length,
      indices: panelMesh.indices,
      edgeParticleIdsByKey: panelMesh.edgeParticleIdsByKey,
      boundaryParticleIds: panelMesh.boundaryParticleIds,
    };

    panels.push(panel);

    nextParticleId += panel.particleCount;
  }

  const distanceConstraints: DistanceConstraint[] = [];
  const distanceConstraintKeys = new Set<string>();

  const bendConstraints: BendConstraint[] = [];
  const sharedEdges = new Map<string, SharedEdgeRecord>();

  // const pinnedParticleIds = [];

  const pinnedParticleIds = [
    ...new Set(
      panels
        .filter((panel) => rootPieceIds.has(panel.pieceId))
        .flatMap((panel) =>
          getRootAnchorParticleIds(panel, restPositionValues),
        ),
    ),
  ];

  for (const panel of panels) {
    for (let index = 0; index < panel.indices.length; index += 3) {
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

      const triangleEdgesWithOpposite = [
        {
          edgeA: triangle[0],
          edgeB: triangle[1],
          oppositeParticleId: triangle[2],
        },
        {
          edgeA: triangle[1],
          edgeB: triangle[2],
          oppositeParticleId: triangle[0],
        },
        {
          edgeA: triangle[2],
          edgeB: triangle[0],
          oppositeParticleId: triangle[1],
        },
      ];

      for (const edge of triangleEdgesWithOpposite) {
        const sharedEdgeKey = getConstraintEdgeKey(edge.edgeA, edge.edgeB);

        const previousTriangle = sharedEdges.get(sharedEdgeKey);

        if (!previousTriangle) {
          sharedEdges.set(sharedEdgeKey, {
            oppositeParticleId: edge.oppositeParticleId,
          });

          continue;
        }

        const firstOppositeParticleId = previousTriangle.oppositeParticleId;
        const secondOppositeParticleId = edge.oppositeParticleId;

        /*
         * Same triangle / malformed topology guard.
         */
        if (firstOppositeParticleId === secondOppositeParticleId) {
          continue;
        }

        bendConstraints.push({
          a: firstOppositeParticleId,
          b: secondOppositeParticleId,
          restLength: getDistance(
            restPositionValues,
            firstOppositeParticleId,
            secondOppositeParticleId,
          ),
          stiffness: DEFAULT_BEND_STIFFNESS,
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
      const edgeBIndex = seam.reverseEdgeB ? pairCount - 1 - index : index;

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
    bendConstraints,
    stitchConstraints,
    pinnedParticleIds,
  };
}
