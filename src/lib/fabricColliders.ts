export type EllipsoidCollider = {
  id: string;
  centre: [number, number, number];
  radii: [number, number, number];
  clearance: number;
};

export type CapsuleCollider = {
  id: string;
  start: [number, number, number];
  end: [number, number, number];
  radius: number;
  clearance: number;
};

export const DEFAULT_TORSO_COLLIDERS: EllipsoidCollider[] = [
  {
    id: "chest",
    centre: [0, 1.24, 0],
    radii: [0.16, 0.14, 0.105],
    clearance: 0.006,
  },
  {
    id: "abdomen",
    centre: [0, 1.02, 0],
    radii: [0.135, 0.17, 0.095],
    clearance: 0.006,
  },
];

export const DEFAULT_BODY_ELLIPSOIDS: EllipsoidCollider[] = [
  ...DEFAULT_TORSO_COLLIDERS,

  {
    id: "hips",
    centre: [0, 0.7, 0.01],
    radii: [0.18, 0.16, 0.12],
    clearance: 0.006,
  },
];

export const DEFAULT_ARM_CAPSULES: CapsuleCollider[] = [
  {
    id: "left-arm",
    start: [-0.24, 1.36, 0],
    end: [-0.36, 0.78, 0],
    radius: 0.055,
    clearance: 0.006,
  },
  {
    id: "right-arm",
    start: [0.24, 1.36, 0],
    end: [0.36, 0.78, 0],
    radius: 0.055,
    clearance: 0.006,
  },
];

export type FloorCollider = {
  y: number;
  clearance: number;
};

export const DEFAULT_FLOOR_COLLIDER: FloorCollider = {
  y: 0,
  clearance: 0.005,
};
