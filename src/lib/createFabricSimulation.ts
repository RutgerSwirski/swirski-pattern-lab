import type {
  CompiledFabricGarment,
  DistanceConstraint,
  FabricStitchConstraint,
} from "./compileFabricGarment";

const EPSILON = 0.000001;

type FabricSimulationOptions = {
  iterations?: number;
  damping?: number;
  gravityY?: number;
};

export type FabricSimulation = {
  positions: Float32Array;
  reset: () => void;
  step: (deltaSeconds: number) => void;
};

function setParticlePosition(
  positions: Float32Array,
  particleId: number,
  x: number,
  y: number,
  z: number,
) {
  const offset = particleId * 3;

  positions[offset] = x;
  positions[offset + 1] = y;
  positions[offset + 2] = z;
}

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
  constraint: DistanceConstraint | FabricStitchConstraint,
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

    for (let iteration = 0; iteration < iterations; iteration += 1) {
      for (const constraint of compiledFabric.distanceConstraints) {
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

      applyPinnedParticles();
    }
  }

  setParticlePosition(positions, 0, positions[0], positions[1], positions[2]);

  return {
    positions,
    reset,
    step,
  };
}
