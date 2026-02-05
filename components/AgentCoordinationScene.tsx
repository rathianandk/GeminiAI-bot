
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface AgentCoordinationSceneProps {
  activeAgent: string | null;
}

const AGENTS = [
  { name: 'Supervisor', color: 0xffffff, pos: [0, 0, 0], isSupervisor: true },
  { name: 'Spatial', color: 0x6366f1, pos: [0, 1.6, 0] },
  { name: 'Discovery', color: 0x10b981, pos: [1.5, 0.5, 0] },
  { name: 'Lens', color: 0xd946ef, pos: [1.0, -1.3, 0] },
  { name: 'Analytics', color: 0x0ea5e9, pos: [-1.0, -1.3, 0] },
  { name: 'Linguistic', color: 0xf59e0b, pos: [-1.5, 0.5, 0] },
  { name: 'Historian', color: 0xfacc15, pos: [0, 0.4, 1.2] },
  { name: 'Impact', color: 0x22d3ee, pos: [0, -0.4, -1.2] },
  { name: 'Healing', color: 0x34d399, pos: [-0.8, 1.2, 0.8] },
];

const AgentCoordinationScene: React.FC<AgentCoordinationSceneProps> = ({ activeAgent }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const nodesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const labelsRef = useRef<Map<string, THREE.Sprite>>(new Map());
  const supervisorLinesRef = useRef<Map<string, THREE.Line>>(new Map());
  const activeAgentRef = useRef<string | null>(null);

  useEffect(() => {
    activeAgentRef.current = activeAgent;
  }, [activeAgent]);

  const createTextLabel = (text: string, color: number) => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return new THREE.Sprite();

    canvas.width = 256;
    canvas.height = 64;

    context.fillStyle = 'rgba(0,0,0,0)';
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.font = 'bold 24px monospace';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    
    context.shadowColor = 'rgba(0,0,0,1)';
    context.shadowBlur = 4;
    context.shadowOffsetX = 2;
    context.shadowOffsetY = 2;

    const hexColor = `#${color.toString(16).padStart(6, '0')}`;
    context.fillStyle = hexColor;
    context.fillText(text.toUpperCase(), canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(1.5, 0.375, 1);
    return sprite;
  };

  useEffect(() => {
    if (!containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = 240;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.z = 5;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0xffffff, 1.2);
    pointLight.position.set(5, 5, 5);
    scene.add(pointLight);

    // Create Nodes
    AGENTS.forEach((agent) => {
      const geometry = agent.isSupervisor 
        ? new THREE.OctahedronGeometry(0.22) 
        : new THREE.SphereGeometry(0.16, 32, 32);
      
      const material = new THREE.MeshPhongMaterial({
        color: agent.color,
        emissive: agent.color,
        emissiveIntensity: 0.3,
        shininess: 100,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(agent.pos[0], agent.pos[1], agent.pos[2]);
      scene.add(mesh);
      nodesRef.current.set(agent.name, mesh);

      const ringGeo = new THREE.RingGeometry(0.24, 0.28, 32);
      const ringMat = new THREE.MeshBasicMaterial({ 
        color: agent.color, 
        side: THREE.DoubleSide, 
        transparent: true, 
        opacity: 0.2 
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.set(agent.pos[0], agent.pos[1], agent.pos[2]);
      scene.add(ring);

      const label = createTextLabel(agent.name, agent.color);
      label.position.set(agent.pos[0], agent.pos[1] - 0.35, agent.pos[2]);
      scene.add(label);
      labelsRef.current.set(agent.name, label);
    });

    // Neural Web Connections (Supervisor Arrows)
    const supervisor = AGENTS.find(a => a.isSupervisor)!;
    AGENTS.forEach(agent => {
      if (agent === supervisor) return;
      
      const lineMaterial = new THREE.LineBasicMaterial({ 
        color: agent.color, 
        transparent: true, 
        opacity: 0.4 
      });
      
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(...supervisor.pos),
        new THREE.Vector3(...agent.pos),
      ]);
      const line = new THREE.Line(geometry, lineMaterial);
      scene.add(line);
      supervisorLinesRef.current.set(agent.name, line);
    });

    // Mesh Ring Connections
    const outerAgents = AGENTS.filter(a => !a.isSupervisor);
    for (let i = 0; i < outerAgents.length; i++) {
      for (let j = i + 1; j < outerAgents.length; j++) {
        const dist = new THREE.Vector3(...outerAgents[i].pos).distanceTo(new THREE.Vector3(...outerAgents[j].pos));
        if (dist < 2.5) {
          const geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(...outerAgents[i].pos),
            new THREE.Vector3(...outerAgents[j].pos),
          ]);
          const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0x6366f1, transparent: true, opacity: 0.05 }));
          scene.add(line);
        }
      }
    }

    let frameId: number;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      
      nodesRef.current.forEach((mesh, name) => {
        const isActive = name === activeAgentRef.current;
        const isSupervisor = name === 'Supervisor';
        
        let targetScale = 1.0;
        if (isActive) {
          targetScale = 1.6 + Math.sin(Date.now() * 0.01) * 0.2;
        } else if (isSupervisor) {
          targetScale = 1.1 + Math.sin(Date.now() * 0.002) * 0.05;
          mesh.rotation.y += 0.02;
          mesh.rotation.x += 0.01;
        }
        
        mesh.scale.setScalar(THREE.MathUtils.lerp(mesh.scale.x, targetScale, 0.1));
        
        if (mesh.material instanceof THREE.MeshPhongMaterial) {
           const baseIntensity = isSupervisor ? 0.6 : 0.2;
           const targetIntensity = isActive ? 1.8 + Math.sin(Date.now() * 0.02) * 0.6 : baseIntensity;
           mesh.material.emissiveIntensity = THREE.MathUtils.lerp(mesh.material.emissiveIntensity, targetIntensity, 0.1);
        }
      });

      // Update Invocation Path Lighting
      supervisorLinesRef.current.forEach((line, name) => {
        const isBeingInvoked = name === activeAgentRef.current;
        const targetOpacity = isBeingInvoked ? 1.0 : 0.35;
        const targetColor = isBeingInvoked ? 0xffffff : AGENTS.find(a => a.name === name)?.color || 0x6366f1;

        if (line.material instanceof THREE.LineBasicMaterial) {
          line.material.opacity = THREE.MathUtils.lerp(line.material.opacity, targetOpacity, 0.1);
          line.material.color.lerp(new THREE.Color(targetColor), 0.1);
          line.renderOrder = isBeingInvoked ? 1 : 0;
        }
      });

      labelsRef.current.forEach((label, name) => {
        const isActive = name === activeAgentRef.current;
        const targetOpacity = (activeAgentRef.current === null || isActive) ? 0.8 : 0.3;
        if (label.material instanceof THREE.SpriteMaterial) {
          label.material.opacity = THREE.MathUtils.lerp(label.material.opacity, targetOpacity, 0.1);
        }
      });

      scene.rotation.y += 0.003;
      scene.rotation.x = Math.sin(Date.now() * 0.0004) * 0.08;

      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
      renderer.setSize(w, height);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(frameId);
      renderer.dispose();
      if (containerRef.current && renderer.domElement.parentNode) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div 
      ref={containerRef} 
      className="w-full h-[240px] bg-indigo-950/10 rounded-3xl border border-white/10 relative overflow-hidden mb-4 shadow-inner group"
    >
      <div className="absolute top-3 left-4 text-[9px] font-black text-indigo-300 uppercase tracking-[0.5em] z-10 drop-shadow-[0_0_8px_rgba(165,180,252,0.4)]">
        Neural Coordination Mesh
      </div>
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-indigo-500/10 to-transparent"></div>
      
      <div className="absolute bottom-3 left-0 right-0 text-center z-10 transition-opacity duration-500">
        <span className={`inline-block bg-indigo-600/20 text-indigo-400 px-4 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest border border-indigo-500/20 shadow-lg backdrop-blur-md transition-all ${activeAgent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
          {activeAgent ? `Signal: Supervisor Invoked ${activeAgent}` : 'Grid Standby'}
        </span>
      </div>
    </div>
  );
};

export default AgentCoordinationScene;
