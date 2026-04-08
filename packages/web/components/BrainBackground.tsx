"use client";

import { useRef, useMemo, useCallback } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

// Simple 3D simplex-like noise for vertex displacement
function noise3D(x: number, y: number, z: number): number {
  const p = x * 7.13 + y * 17.31 + z * 31.71;
  return (
    Math.sin(p) * 0.5 +
    Math.sin(p * 2.17 + 1.13) * 0.25 +
    Math.sin(p * 4.31 + 2.71) * 0.125
  );
}

/** Organic brain-shaped particle cloud with neural connections */
function BrainMesh() {
  const groupRef = useRef<THREE.Group>(null);
  const pointsRef = useRef<THREE.Points>(null);
  const linesRef = useRef<THREE.LineSegments>(null);
  const timeRef = useRef(0);

  const PARTICLE_COUNT = 900;
  const CONNECTION_DISTANCE = 0.45;

  // Generate brain-shaped point positions
  const { positions, basePositions, colors } = useMemo(() => {
    const pos = new Float32Array(PARTICLE_COUNT * 3);
    const base = new Float32Array(PARTICLE_COUNT * 3);
    const col = new Float32Array(PARTICLE_COUNT * 3);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // Distribute on a sphere, then distort into brain shape
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 1.6 + Math.random() * 0.3;

      let x = r * Math.sin(phi) * Math.cos(theta);
      let y = r * Math.sin(phi) * Math.sin(theta) * 0.85; // slightly flatten
      let z = r * Math.cos(phi) * 0.9;

      // Brain-like displacement: bulge the top, indent the middle
      const n = noise3D(x * 0.8, y * 0.8, z * 0.8);
      x += n * 0.35;
      y += n * 0.25 + (z > 0 ? 0.15 : -0.05); // asymmetric top bulge
      z += n * 0.3;

      // Fissure: indent along the center line (brain split)
      const centerDist = Math.abs(x);
      if (centerDist < 0.2) {
        y -= (0.2 - centerDist) * 1.2;
      }

      const idx = i * 3;
      pos[idx] = x;
      pos[idx + 1] = y;
      pos[idx + 2] = z;
      base[idx] = x;
      base[idx + 1] = y;
      base[idx + 2] = z;

      // Color: indigo to violet gradient based on height
      const t = (y + 2) / 4;
      col[idx] = 0.35 + t * 0.25;     // R: 0.35 -> 0.6
      col[idx + 1] = 0.2 + t * 0.15;  // G: 0.2 -> 0.35
      col[idx + 2] = 0.9 - t * 0.1;   // B: 0.9 -> 0.8
    }

    return { positions: pos, basePositions: base, colors: col };
  }, []);

  // Generate neural connection lines between nearby particles
  const linePositions = useMemo(() => {
    const lines: number[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      for (let j = i + 1; j < PARTICLE_COUNT; j++) {
        const ix = i * 3, jx = j * 3;
        const dx = basePositions[ix] - basePositions[jx];
        const dy = basePositions[ix + 1] - basePositions[jx + 1];
        const dz = basePositions[ix + 2] - basePositions[jx + 2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < CONNECTION_DISTANCE && lines.length < 12000) {
          lines.push(
            basePositions[ix], basePositions[ix + 1], basePositions[ix + 2],
            basePositions[jx], basePositions[jx + 1], basePositions[jx + 2]
          );
        }
      }
    }
    return new Float32Array(lines);
  }, [basePositions]);

  // Animate: gentle breathing + subtle drift
  useFrame((_, delta) => {
    timeRef.current += delta * 0.4;
    const t = timeRef.current;

    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(t * 0.3) * 0.15 + t * 0.02;
      groupRef.current.rotation.x = Math.sin(t * 0.2) * 0.05;
    }

    if (pointsRef.current) {
      const posAttr = pointsRef.current.geometry.getAttribute("position");
      const arr = posAttr.array as Float32Array;

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const idx = i * 3;
        const bx = basePositions[idx];
        const by = basePositions[idx + 1];
        const bz = basePositions[idx + 2];

        // Breathing: particles pulse outward/inward
        const breathe = Math.sin(t + i * 0.01) * 0.03;
        const drift = noise3D(bx + t * 0.1, by + t * 0.1, bz) * 0.04;

        arr[idx] = bx + bx * breathe + drift;
        arr[idx + 1] = by + by * breathe + drift * 0.5;
        arr[idx + 2] = bz + bz * breathe + drift * 0.7;
      }
      posAttr.needsUpdate = true;
    }
  });

  return (
    <group ref={groupRef} position={[0, 0.2, 0]}>
      {/* Particle cloud */}
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[positions, 3]}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[colors, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.025}
          vertexColors
          transparent
          opacity={0.7}
          sizeAttenuation
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>

      {/* Neural connections */}
      <lineSegments ref={linesRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[linePositions, 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial
          color="#6366f1"
          transparent
          opacity={0.08}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </lineSegments>
    </group>
  );
}

/** Floating ambient particles around the brain */
function AmbientParticles() {
  const ref = useRef<THREE.Points>(null);

  const COUNT = 200;
  const { positions, speeds } = useMemo(() => {
    const pos = new Float32Array(COUNT * 3);
    const spd = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 8;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 8;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 8;
      spd[i] = 0.2 + Math.random() * 0.5;
    }
    return { positions: pos, speeds: spd };
  }, []);

  useFrame((_, delta) => {
    if (!ref.current) return;
    const arr = ref.current.geometry.getAttribute("position").array as Float32Array;
    for (let i = 0; i < COUNT; i++) {
      arr[i * 3 + 1] += delta * speeds[i] * 0.1;
      if (arr[i * 3 + 1] > 4) arr[i * 3 + 1] = -4;
    }
    ref.current.geometry.getAttribute("position").needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.015}
        color="#818cf8"
        transparent
        opacity={0.3}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

export default function BrainBackground() {
  return (
    <div className="fixed inset-0 z-0 pointer-events-none">
      <Canvas
        camera={{ position: [0, 0, 4.5], fov: 50 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        <ambientLight intensity={0.5} />
        <BrainMesh />
        <AmbientParticles />
      </Canvas>
      {/* Fade overlay so brain doesn't compete with chat content */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a12] via-[#0a0a12]/80 to-transparent" />
    </div>
  );
}
