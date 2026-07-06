import * as THREE from "three";

import type { CapsuleCollider } from "./fabricColliders";

type Vector3Tuple = [number, number, number];

type ArmCapsuleOptions = {
  radius?: number;
  clearance?: number;
};

function toVector3Tuple(vector: THREE.Vector3): Vector3Tuple {
  return [vector.x, vector.y, vector.z];
}

function normaliseBoneName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findSkinnedMeshes(scene: THREE.Object3D): THREE.SkinnedMesh[] {
  return scene.getObjectsByProperty(
    "isSkinnedMesh",
    true,
  ) as THREE.SkinnedMesh[];
}

function collectSkeletonBones(scene: THREE.Object3D): THREE.Bone[] {
  const bonesByUuid = new Map<string, THREE.Bone>();

  for (const mesh of findSkinnedMeshes(scene)) {
    for (const bone of mesh.skeleton.bones) {
      bonesByUuid.set(bone.uuid, bone);
    }
  }

  return [...bonesByUuid.values()];
}

function findBone(
  bones: THREE.Bone[],
  expectedName: string,
): THREE.Bone | null {
  const targetName = normaliseBoneName(expectedName);

  return (
    bones.find((bone) => normaliseBoneName(bone.name) === targetName) ?? null
  );
}

function getBoneWorldPosition(bone: THREE.Bone): Vector3Tuple {
  const position = new THREE.Vector3();

  bone.getWorldPosition(position);

  return toVector3Tuple(position);
}

export function inspectAvatarRig(scene: THREE.Object3D) {
  scene.updateMatrixWorld(true);

  const skinnedMeshes = findSkinnedMeshes(scene);
  const bones = collectSkeletonBones(scene);

  console.table(
    skinnedMeshes.map((mesh) => ({
      name: mesh.name || "(unnamed)",
      boneCount: mesh.skeleton.bones.length,
    })),
  );

  console.table(
    bones.map((bone) => {
      const position = new THREE.Vector3();
      bone.getWorldPosition(position);

      return {
        name: bone.name,
        parent: bone.parent?.name ?? "(none)",
        x: Number(position.x.toFixed(3)),
        y: Number(position.y.toFixed(3)),
        z: Number(position.z.toFixed(3)),
      };
    }),
  );

  return {
    skinnedMeshes,
    bones,
  };
}

export function extractArmCapsulesFromRig(
  scene: THREE.Object3D,
  { radius = 0.055, clearance = 0.006 }: ArmCapsuleOptions = {},
): CapsuleCollider[] {
  scene.updateMatrixWorld(true);

  const bones = collectSkeletonBones(scene);

  const upperArmLeft = findBone(bones, "upperarm_l");
  const lowerArmLeft = findBone(bones, "lowerarm_l");

  const upperArmRight = findBone(bones, "upperarm_r");
  const lowerArmRight = findBone(bones, "lowerarm_r");

  const colliders: CapsuleCollider[] = [];

  if (upperArmLeft && lowerArmLeft) {
    colliders.push({
      id: "left-arm",
      start: getBoneWorldPosition(upperArmLeft),
      end: getBoneWorldPosition(lowerArmLeft),
      radius,
      clearance,
    });
  } else {
    console.warn("Could not build left arm collider.", {
      upperArmFound: Boolean(upperArmLeft),
      lowerArmFound: Boolean(lowerArmLeft),
    });
  }

  if (upperArmRight && lowerArmRight) {
    colliders.push({
      id: "right-arm",
      start: getBoneWorldPosition(upperArmRight),
      end: getBoneWorldPosition(lowerArmRight),
      radius,
      clearance,
    });
  } else {
    console.warn("Could not build right arm collider.", {
      upperArmFound: Boolean(upperArmRight),
      lowerArmFound: Boolean(lowerArmRight),
    });
  }

  return colliders;
}
