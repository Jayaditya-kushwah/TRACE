import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Points, PointMaterial } from '@react-three/drei';
import * as THREE from 'three';

// 1. Particle System
export function ParticleSystem({ count = 3000 }) {
  const points = useRef<THREE.Points>(null);
  
  const particlesPosition = useMemo(() => {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 15;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 15;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 15;
    }
    return positions;
  }, [count]);

  useFrame((state) => {
    if (points.current) {
      points.current.rotation.x -= 0.0003;
      points.current.rotation.y -= 0.0005;
      
      // Interactive camera follow (Parallax effect)
      state.camera.position.x += (state.pointer.x * 2.5 - state.camera.position.x) * 0.03;
      state.camera.position.y += (state.pointer.y * 2.5 - state.camera.position.y) * 0.03;
      state.camera.lookAt(0, 0, 0);
    }
  });

  return (
    <Points ref={points} positions={particlesPosition} stride={3} frustumCulled={false}>
      <PointMaterial 
        transparent 
        color="#8B5CF6" 
        size={0.03} 
        sizeAttenuation={true} 
        depthWrite={false} 
        blending={THREE.AdditiveBlending}
      />
    </Points>
  );
}

// 2. Central 3D Geometry
export function CyberTorus() {
  const meshRef = useRef<THREE.Mesh>(null);
  const outerRef = useRef<THREE.Mesh>(null);
  
  useFrame((_state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += delta * 0.1;
      meshRef.current.rotation.y += delta * 0.15;
    }
    if (outerRef.current) {
      outerRef.current.rotation.x -= delta * 0.05;
      outerRef.current.rotation.y -= delta * 0.08;
    }
  });

  return (
    <group>
      <mesh ref={meshRef}>
        <torusGeometry args={[1.5, 0.3, 16, 100]} />
        <meshStandardMaterial 
          color="#3B82F6" 
          wireframe={true} 
          transparent 
          opacity={0.4}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh ref={outerRef} scale={1.5}>
        <icosahedronGeometry args={[1.5, 1]} />
        <meshStandardMaterial 
          color="#8B5CF6" 
          wireframe={true} 
          transparent 
          opacity={0.15}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

// 3. Shader Background
export function BackgroundShader() {
  const shaderRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
    }),
    []
  );

  useFrame((state) => {
    if (shaderRef.current) {
      shaderRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  const vertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    uniform float uTime;
    varying vec2 vUv;
    
    void main() {
      vec2 uv = vUv;
      float color1 = sin(uv.x * 5.0 + uTime * 0.2) * 0.5 + 0.5;
      float color2 = cos(uv.y * 4.0 - uTime * 0.3) * 0.5 + 0.5;
      
      // Very dark cyber aesthetic
      vec3 finalColor = mix(vec3(0.01, 0.02, 0.04), vec3(0.05, 0.02, 0.1), color1 * color2);
      
      // Vignette
      float dist = distance(uv, vec2(0.5));
      finalColor *= smoothstep(0.8, 0.0, dist);
      
      gl_FragColor = vec4(finalColor, 1.0);
    }
  `;

  return (
    <mesh position={[0, 0, -20]}>
      <planeGeometry args={[100, 100]} />
      <shaderMaterial
        ref={shaderRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        depthWrite={false}
      />
    </mesh>
  );
}
