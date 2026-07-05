import { Html, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense, useEffect } from "react";
import * as THREE from "three";
import type { PatternPiece } from "../types";

type ThreePreviewProps = {
  modelUrl: string;
};

function AvatarModel({
  modelUrl,
  pieces,
}: {
  modelUrl: string;
  pieces?: PatternPiece[];
}) {
  const { scene } = useGLTF(modelUrl);

  useEffect(() => {
    console.log("Loaded avatar scene:", scene);
    console.log("Avatar bounds source:", modelUrl);

    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
  }, [modelUrl, scene]);

  return (
    <group>
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

export function ThreePreview({ modelUrl }: ThreePreviewProps) {
  return (
    <Canvas
      shadows
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

        <AvatarModel modelUrl={modelUrl} />
      </Suspense>

      <OrbitControls
        enablePan={false}
        target={[0, 1, 0]}
        minDistance={1}
        maxDistance={8}
      />
    </Canvas>
  );
}
