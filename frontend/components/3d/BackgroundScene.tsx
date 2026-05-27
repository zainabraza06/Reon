'use client';

import { useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Stars, Float, useScroll } from '@react-three/drei';
import * as random from 'maath/random/dist/maath-random.cjs';
import { Points, PointMaterial } from '@react-three/drei';

function Sphere({ color, position, scale }: { color: string; position: [number, number, number]; scale: number }) {
  return (
    <Float floatIntensity={2} rotationIntensity={1} speed={1.5}>
      <mesh position={position} scale={scale}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshPhysicalMaterial
          color={color}
          roughness={0}
          metalness={0.1}
          transmission={0.9} // Glass-like
          thickness={0.5}
          clearcoat={1}
        />
      </mesh>
    </Float>
  );
}

function StarField(props: any) {
  const ref = useRef<any>();
  const [sphere] = useState(() => random.inSphere(new Float32Array(5000), { radius: 10 }));

  useFrame((state, delta) => {
    if (ref.current) {
        ref.current.rotation.x -= delta / 10;
        ref.current.rotation.y -= delta / 15;
    }
  });

  return (
    <group rotation={[0, 0, Math.PI / 4]}>
      <Points ref={ref} positions={sphere} stride={3} frustumCulled={false} {...props}>
        <PointMaterial transparent color="#ffffff" size={0.02} sizeAttenuation={true} depthWrite={false} />
      </Points>
    </group>
  );
}

export default function BackgroundScene() {
    return (
        <div className="fixed top-0 left-0 w-full h-full -z-10 bg-gradient-to-br from-[#0f172a] via-[#1e1b4b] to-[#312e81]">
            <Canvas camera={{ position: [0, 0, 5], fov: 60 }}>
                <ambientLight intensity={0.5} />
                <directionalLight position={[10, 10, 5]} intensity={1} />
                
                <StarField />
                
                <Sphere color="#8b5cf6" position={[-2, 1, -2]} scale={1.2} /> {/* Violet */}
                <Sphere color="#3b82f6" position={[2, -1, -1]} scale={1} />  {/* Blue */}
                <Sphere color="#10b981" position={[0, -2, -3]} scale={0.8} /> {/* Emerald */}

                {/* Additional ambient lighting for the glass effect */}
                <pointLight position={[-10, -10, -10]} intensity={1} color="#8b5cf6" />
                <pointLight position={[10, 10, 10]} intensity={1} color="#3b82f6" />
            </Canvas>
        </div>
    );
}
