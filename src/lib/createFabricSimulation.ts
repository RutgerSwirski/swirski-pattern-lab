import type {
  BendConstraint,
  CompiledFabricGarment,
  DistanceConstraint,
  FabricStitchConstraint,
} from "./compileFabricGarment";

import type {
  EllipsoidCollider,
  FloorCollider,
  CapsuleCollider,
} from "./fabricColliders";

export const EPSILON = 0.000001;

type FabricSimulationOptions = {
  iterations?: number;
  damping?: number;
  gravityY?: number;
  colliders?: EllipsoidCollider[];
  floor?: FloorCollider;
  capsuleColliders?: CapsuleCollider[];
};

export type FabricSimulation = {
  positions: Float32Array;
  reset: () => void;
  step: (deltaSeconds: number) => void;
};

function copyParticlePosition(
  source: Float32Array,
  target: Float32Array,
  particleId: number,
) {
  const offset = particleId * 3;

  target[offset] = source[offset];
  target[offset + 1] = source[offset + 1];
  target[offset + 2] = source[offset + 2];
}

function solveDistanceConstraint(
  positions: Float32Array,
  inverseMasses: Float32Array,
  constraint: DistanceConstraint | BendConstraint | FabricStitchConstraint,
  restLength: number,
) {
  const aOffset = constraint.a * 3;
  const bOffset = constraint.b * 3;

  const deltaX = positions[bOffset] - positions[aOffset];
  const deltaY = positions[bOffset + 1] - positions[aOffset + 1];
  const deltaZ = positions[bOffset + 2] - positions[aOffset + 2];

  const distanceSquared = deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ;

  if (distanceSquared < EPSILON) {
    return;
  }

  const distance = Math.sqrt(distanceSquared);

  const inverseMassA = inverseMasses[constraint.a];
  const inverseMassB = inverseMasses[constraint.b];
  const totalInverseMass = inverseMassA + inverseMassB;

  if (totalInverseMass <= 0) {
    return;
  }

  const error = distance - restLength;
  const stiffness = constraint.stiffness;

  const correction = (error / distance) * (stiffness / totalInverseMass);

  if (inverseMassA > 0) {
    positions[aOffset] += deltaX * correction * inverseMassA;
    positions[aOffset + 1] += deltaY * correction * inverseMassA;
    positions[aOffset + 2] += deltaZ * correction * inverseMassA;
  }

  if (inverseMassB > 0) {
    positions[bOffset] -= deltaX * correction * inverseMassB;
    positions[bOffset + 1] -= deltaY * correction * inverseMassB;
    positions[bOffset + 2] -= deltaZ * correction * inverseMassB;
  }
}

function solveEllipsoidCollisions(
  positions: Float32Array,
  previousPositions: Float32Array,
  inverseMasses: Float32Array,
  colliders: EllipsoidCollider[],
) {
  for (const collider of colliders) {
    const [centreX, centreY, centreZ] = collider.centre;

    const radiusX = collider.radii[0] + collider.clearance;
    const radiusY = collider.radii[1] + collider.clearance;
    const radiusZ = collider.radii[2] + collider.clearance;

    for (
      let particleId = 0;
      particleId < inverseMasses.length;
      particleId += 1
    ) {
      if (inverseMasses[particleId] === 0) {
        continue;
      }

      const offset = particleId * 3;

      const positionX = positions[offset];
      const positionY = positions[offset + 1];
      const positionZ = positions[offset + 2];

      const scaledX = (positionX - centreX) / radiusX;
      const scaledY = (positionY - centreY) / radiusY;
      const scaledZ = (positionZ - centreZ) / radiusZ;

      const scaledDistance = Math.sqrt(
        scaledX * scaledX + scaledY * scaledY + scaledZ * scaledZ,
      );

      /*
       * Outside the expanded torso ellipsoid: no collision.
       */
      if (scaledDistance >= 1) {
        continue;
      }

      /*
       * Very rare fallback: particle exactly in the collider centre.
       */
      if (scaledDistance < EPSILON) {
        const correctionZ = radiusZ;

        positions[offset + 2] = centreZ + correctionZ;
        previousPositions[offset + 2] = centreZ + correctionZ;

        continue;
      }

      /*
       * Push particle outward onto the ellipsoid surface.
       */
      const scale = 1 / scaledDistance;

      const correctedX = centreX + scaledX * scale * radiusX;
      const correctedY = centreY + scaledY * scale * radiusY;
      const correctedZ = centreZ + scaledZ * scale * radiusZ;

      const correctionX = correctedX - positionX;
      const correctionY = correctedY - positionY;
      const correctionZ = correctedZ - positionZ;

      positions[offset] = correctedX;
      positions[offset + 1] = correctedY;
      positions[offset + 2] = correctedZ;

      /*
       * Move previous position by the same amount.
       * This avoids the collider accidentally injecting a huge velocity.
       */
      previousPositions[offset] += correctionX;
      previousPositions[offset + 1] += correctionY;
      previousPositions[offset + 2] += correctionZ;
    }
  }
}

function solveCapsuleCollisions(
  positions: Float32Array,
  previousPositions: Float32Array,
  inverseMasses: Float32Array,
  colliders: CapsuleCollider[],
) {
  for (const collider of colliders) {
    const [startX, startY, startZ] = collider.start;
    const [endX, endY, endZ] = collider.end;

    const segmentX = endX - startX;
    const segmentY = endY - startY;
    const segmentZ = endZ - startZ;

    const segmentLengthSquared =
      segmentX * segmentX + segmentY * segmentY + segmentZ * segmentZ;

    const contactRadius = collider.radius + collider.clearance;
    const contactRadiusSquared = contactRadius * contactRadius;

    /*
     * Used only when a particle lands exactly on the capsule axis.
     * Push outward from the avatar centre.
     */
    const fallbackNormalX = (startX + endX) / 2 < 0 ? -1 : 1;

    for (
      let particleId = 0;
      particleId < inverseMasses.length;
      particleId += 1
    ) {
      if (inverseMasses[particleId] === 0) {
        continue;
      }

      const offset = particleId * 3;

      const positionX = positions[offset];
      const positionY = positions[offset + 1];
      const positionZ = positions[offset + 2];

      const fromStartX = positionX - startX;
      const fromStartY = positionY - startY;
      const fromStartZ = positionZ - startZ;

      const projection =
        segmentLengthSquared > EPSILON
          ? Math.max(
              0,
              Math.min(
                1,
                (fromStartX * segmentX +
                  fromStartY * segmentY +
                  fromStartZ * segmentZ) /
                  segmentLengthSquared,
              ),
            )
          : 0;

      const closestX = startX + segmentX * projection;
      const closestY = startY + segmentY * projection;
      const closestZ = startZ + segmentZ * projection;

      const deltaX = positionX - closestX;
      const deltaY = positionY - closestY;
      const deltaZ = positionZ - closestZ;

      const distanceSquared =
        deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ;

      if (distanceSquared >= contactRadiusSquared) {
        continue;
      }

      let normalX: number;
      let normalY: number;
      let normalZ: number;

      if (distanceSquared < EPSILON) {
        normalX = fallbackNormalX;
        normalY = 0;
        normalZ = 0;
      } else {
        const inverseDistance = 1 / Math.sqrt(distanceSquared);

        normalX = deltaX * inverseDistance;
        normalY = deltaY * inverseDistance;
        normalZ = deltaZ * inverseDistance;
      }

      const correctedX = closestX + normalX * contactRadius;
      const correctedY = closestY + normalY * contactRadius;
      const correctedZ = closestZ + normalZ * contactRadius;

      const correctionX = correctedX - positionX;
      const correctionY = correctedY - positionY;
      const correctionZ = correctedZ - positionZ;

      positions[offset] = correctedX;
      positions[offset + 1] = correctedY;
      positions[offset + 2] = correctedZ;

      previousPositions[offset] += correctionX;
      previousPositions[offset + 1] += correctionY;
      previousPositions[offset + 2] += correctionZ;
    }
  }
}

function solveFloorCollision(
  positions: Float32Array,
  previousPositions: Float32Array,
  inverseMasses: Float32Array,
  floor: FloorCollider,
) {
  const contactY = floor.y + floor.clearance;

  for (let particleId = 0; particleId < inverseMasses.length; particleId += 1) {
    if (inverseMasses[particleId] === 0) {
      continue;
    }

    const offset = particleId * 3;

    if (positions[offset + 1] >= contactY) {
      continue;
    }

    positions[offset + 1] = contactY;

    /*
     * Stop downward vertical movement on contact.
     * X/Z are unchanged, so fabric can still slide across the floor.
     */
    previousPositions[offset + 1] = contactY;
  }
}

export function createFabricSimulation(
  compiledFabric: CompiledFabricGarment,
  options: FabricSimulationOptions = {},
): FabricSimulation {
  const iterations = options.iterations ?? 14;
  const damping = options.damping ?? 0.996;

  /*
   * Keep this at zero for the first test.
   * Later we add real gravity after body collision exists.
   */
  const gravityY = options.gravityY ?? 0;

  const colliders = options.colliders ?? [];
  const floor = options.floor;
  const capsuleColliders = options.capsuleColliders ?? [];

  const positions = compiledFabric.restPositions.slice();
  const previousPositions = compiledFabric.restPositions.slice();

  const particleCount = positions.length / 3;

  const inverseMasses = new Float32Array(particleCount);
  inverseMasses.fill(1);

  for (const particleId of compiledFabric.pinnedParticleIds) {
    inverseMasses[particleId] = 0;
  }

  function applyPinnedParticles() {
    for (const particleId of compiledFabric.pinnedParticleIds) {
      copyParticlePosition(compiledFabric.restPositions, positions, particleId);

      copyParticlePosition(
        compiledFabric.restPositions,
        previousPositions,
        particleId,
      );
    }
  }

  function reset() {
    positions.set(compiledFabric.restPositions);
    previousPositions.set(compiledFabric.restPositions);
  }

  function step(deltaSeconds: number) {
    const delta = Math.min(Math.max(deltaSeconds, 0), 1 / 30);
    const deltaSquared = delta * delta;

    /*
     * Verlet integration.
     *
     * On the first version gravity is zero, but this keeps
     * the solver ready for drape later.
     */

    for (let particleId = 0; particleId < particleCount; particleId += 1) {
      if (inverseMasses[particleId] === 0) {
        continue;
      }

      const offset = particleId * 3;

      const velocityX =
        (positions[offset] - previousPositions[offset]) * damping;

      const velocityY =
        (positions[offset + 1] - previousPositions[offset + 1]) * damping;

      const velocityZ =
        (positions[offset + 2] - previousPositions[offset + 2]) * damping;

      previousPositions[offset] = positions[offset];
      previousPositions[offset + 1] = positions[offset + 1];
      previousPositions[offset + 2] = positions[offset + 2];

      positions[offset] += velocityX;
      positions[offset + 1] += velocityY + gravityY * deltaSquared;
      positions[offset + 2] += velocityZ;
    }

    for (
      let solverIteration = 0;
      solverIteration < iterations;
      solverIteration += 1
    ) {
      for (const constraint of compiledFabric.distanceConstraints) {
        solveDistanceConstraint(
          positions,
          inverseMasses,
          constraint,
          constraint.restLength,
        );
      }

      for (const constraint of compiledFabric.bendConstraints) {
        solveDistanceConstraint(
          positions,
          inverseMasses,
          constraint,
          constraint.restLength,
        );
      }

      for (const constraint of compiledFabric.stitchConstraints) {
        solveDistanceConstraint(positions, inverseMasses, constraint, 0);
      }

      solveEllipsoidCollisions(
        positions,
        previousPositions,
        inverseMasses,
        colliders,
      );

      solveCapsuleCollisions(
        positions,
        previousPositions,
        inverseMasses,
        capsuleColliders,
      );

      if (floor) {
        solveFloorCollision(positions, previousPositions, inverseMasses, floor);
      }

      applyPinnedParticles();
    }
  }

  return {
    positions,
    reset,
    step,
  };
}
