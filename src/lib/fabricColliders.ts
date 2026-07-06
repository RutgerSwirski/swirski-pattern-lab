export type EllipsoidCollider = {
  id: string;
  centre: [number, number, number];
  radii: [number, number, number];
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

export type FloorCollider = {
  y: number;
  clearance: number;
};

export const DEFAULT_FLOOR_COLLIDER: FloorCollider = {
  y: 0,
  clearance: 0.005,
};
