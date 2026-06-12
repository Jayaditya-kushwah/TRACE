import { useRef, useEffect, useState } from "react";

interface CanvasNode {
  x: number;
  y: number;
  z: number;
  baseX: number;
  baseY: number;
  baseZ: number;
  label?: string;
  isCore?: boolean;
  status?: "VERIFIED" | "TAMPERED" | "MISSING" | "PENDING";
  id?: string;
  size?: number;
  pulse?: number;
}

interface InteractiveMeshCanvasProps {
  mode: "WIREFRAME" | "HALFTONE" | "ORBITS";
  evidence: any[];
  caseTitle: string | null;
  hasAudited: boolean;
  auditResult: any;
}

export function InteractiveMeshCanvas({
  mode,
  evidence,
  caseTitle,
  hasAudited,
  auditResult
}: InteractiveMeshCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const mouseRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });

  // Initialize nodes based on whether a case is selected
  useEffect(() => {
    const list: CanvasNode[] = [];
    if (!caseTitle) {
      // 1. Generate global rotating sphere structure (no case selected)
      const count = 90;
      const radius = 160;
      for (let i = 0; i < count; i++) {
        // Fibonacci sphere point distribution for uniform spacing
        const phi = Math.acos(-1 + (2 * i) / count);
        const theta = Math.sqrt(count * Math.PI) * phi;

        const x = radius * Math.sin(phi) * Math.cos(theta);
        const y = radius * Math.sin(phi) * Math.sin(theta);
        const z = radius * Math.cos(phi);

        list.push({
          x,
          y,
          z,
          baseX: x,
          baseY: y,
          baseZ: z,
          pulse: Math.random() * Math.PI
        });
      }
    } else {
      // 2. Case selected: Render case core node and file branch nodes
      // Case Core
      list.push({
        x: 0,
        y: 0,
        z: 0,
        baseX: 0,
        baseY: 0,
        baseZ: 0,
        isCore: true,
        label: caseTitle.substring(0, 18),
        pulse: 0
      });

      // Evidence nodes
      const count = evidence.length;
      const radius = 150;
      evidence.forEach((ev, idx) => {
        // Distribute nodes around the center core
        const angle = (idx / count) * Math.PI * 2;
        // Introduce small 3D height variations
        const yOffset = Math.sin(idx) * 40;
        const x = radius * Math.cos(angle);
        const z = radius * Math.sin(angle);
        const y = yOffset;

        // Match audit status if available
        let nodeStatus: CanvasNode["status"] = "PENDING";
        if (hasAudited && auditResult) {
          const statusMatch = auditResult.evidence_status?.find(
            (s: any) => s.id === ev.id
          );
          if (statusMatch) {
            nodeStatus = statusMatch.status;
          }
        }

        list.push({
          x,
          y,
          z,
          baseX: x,
          baseY: y,
          baseZ: z,
          label: ev.original_filename.substring(0, 15),
          status: nodeStatus,
          id: ev.id,
          pulse: Math.random() * Math.PI
        });
      });

      // Add secondary aesthetic background dots
      const bgDots = 30;
      for (let i = 0; i < bgDots; i++) {
        const phi = Math.random() * Math.PI * 2;
        const costheta = Math.random() * 2 - 1;
        const theta = Math.acos(costheta);
        const r = 220 + Math.random() * 80;
        const x = r * Math.sin(theta) * Math.cos(phi);
        const y = r * Math.sin(theta) * Math.sin(phi);
        const z = r * Math.cos(theta);
        list.push({
          x,
          y,
          z,
          baseX: x,
          baseY: y,
          baseZ: z,
          pulse: Math.random() * Math.PI
        });
      }
    }
    setNodes(list);
  }, [caseTitle, evidence, hasAudited, auditResult]);

  // Handle mouse movements for rotation parallax
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const { innerWidth, innerHeight } = window;
      mouseRef.current.targetX = (e.clientX - innerWidth / 2) / (innerWidth / 2);
      mouseRef.current.targetY = (e.clientY - innerHeight / 2) / (innerHeight / 2);
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Frame animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let rotationY = 0;
    let rotationX = 0;
    let scanlineY = -300;
    let scanDir = 1;

    const resize = () => {
      if (canvas && containerRef.current) {
        canvas.width = containerRef.current.clientWidth;
        canvas.height = containerRef.current.clientHeight;
      }
    };
    resize();
    window.addEventListener("resize", resize);

    const render = () => {
      if (!canvas || !ctx) return;
      const width = canvas.width;
      const height = canvas.height;

      // Pure dark background
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, width, height);

      // Render aesthetic network background grid (very subtle wireframe)
      ctx.strokeStyle = "rgba(12, 19, 40, 0.25)";
      ctx.lineWidth = 1;
      const gridSize = 80;
      ctx.beginPath();
      for (let x = 0; x < width; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();

      // Smooth mouse rotation
      mouseRef.current.x += (mouseRef.current.targetX - mouseRef.current.x) * 0.05;
      mouseRef.current.y += (mouseRef.current.targetY - mouseRef.current.y) * 0.05;

      // Base auto rotation + mouse offset
      rotationY += 0.003;
      rotationX += 0.001;

      const angleY = rotationY + mouseRef.current.x * 0.4;
      const angleX = rotationX + mouseRef.current.y * 0.2;

      const cosY = Math.cos(angleY);
      const sinY = Math.sin(angleY);
      const cosX = Math.cos(angleX);
      const sinX = Math.sin(angleX);

      // Project nodes in 3D
      const projected = nodes.map((node) => {
        let { baseX, baseY, baseZ } = node;

        // Apply noise vibration if node is tampered
        if (node.status === "TAMPERED") {
          baseX += (Math.random() - 0.5) * 5;
          baseY += (Math.random() - 0.5) * 5;
          baseZ += (Math.random() - 0.5) * 5;
        }

        // Rotate Y
        let x1 = baseX * cosY - baseZ * sinY;
        let z1 = baseX * sinY + baseZ * cosY;

        // Rotate X
        let y2 = baseY * cosX - z1 * sinX;
        let z2 = baseY * sinX + z1 * cosX;

        // Perspective Projection
        const fov = 500;
        const scale = fov / (fov + z2 + 200);
        const px = x1 * scale + width / 2;
        const py = y2 * scale + height / 2;

        return {
          ...node,
          x3d: x1,
          y3d: y2,
          z3d: z2,
          px,
          py,
          scale
        };
      });

      // Update scanline for audit verification sweep
      if (hasAudited) {
        scanlineY += 4 * scanDir;
        if (scanlineY > 300) {
          scanlineY = 300;
          scanDir = -1;
        } else if (scanlineY < -300) {
          scanlineY = -300;
          scanDir = 1;
        }
      }

      // Draw connections/lines (WIREFRAME and ORBITS mode)
      if (mode === "WIREFRAME" || mode === "ORBITS") {
        if (!caseTitle) {
          // Sphere connection wireframe
          ctx.strokeStyle = "rgba(100, 116, 139, 0.08)";
          ctx.lineWidth = 0.5;
          for (let i = 0; i < projected.length; i++) {
            for (let j = i + 1; j < projected.length; j++) {
              const dx = projected[i].x3d - projected[j].x3d;
              const dy = projected[i].y3d - projected[j].y3d;
              const dz = projected[i].z3d - projected[j].z3d;
              const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

              if (dist < 75) {
                // Fade line if further back
                const alpha = (1 - (projected[i].z3d + projected[j].z3d) / 400) * 0.15;
                ctx.strokeStyle = `rgba(99, 102, 241, ${alpha})`;
                ctx.beginPath();
                ctx.moveTo(projected[i].px, projected[i].py);
                ctx.lineTo(projected[j].px, projected[j].py);
                ctx.stroke();
              }
            }
          }
        } else {
          // Case structure wireframe: Connect Core to all evidence branches
          const core = projected.find((n) => n.isCore);
          if (core) {
            projected.forEach((node) => {
              if (node.isCore || node.id === undefined) return; // Skip background dots & core

              ctx.beginPath();
              ctx.moveTo(core.px, core.py);
              ctx.lineTo(node.px, node.py);

              // Select color according to status
              let color = "rgba(100, 116, 139, 0.2)";
              if (hasAudited) {
                if (node.status === "VERIFIED") color = "rgba(16, 185, 129, 0.4)";
                else if (node.status === "TAMPERED") color = "rgba(239, 68, 68, 0.5)";
              } else {
                color = "rgba(99, 102, 241, 0.3)";
              }

              ctx.strokeStyle = color;
              ctx.lineWidth = node.status === "TAMPERED" ? 1.5 : 1;
              ctx.stroke();

              // Draw flow indicator dots moving along the line
              if (mode === "ORBITS") {
                const time = Date.now() * 0.002;
                const ratio = (time + (node.pulse || 0)) % 1;
                const dotX = core.px + (node.px - core.px) * ratio;
                const dotY = core.py + (node.py - core.py) * ratio;

                ctx.fillStyle = node.status === "TAMPERED" ? "#ef4444" : "#10b981";
                ctx.beginPath();
                ctx.arc(dotX, dotY, 2 * node.scale, 0, Math.PI * 2);
                ctx.fill();
              }
            });
          }
        }
      }

      // Draw Audit scanline sweep plane
      if (hasAudited) {
        ctx.fillStyle = "rgba(16, 185, 129, 0.03)";
        const sy = height / 2 + scanlineY;
        ctx.fillRect(0, sy - 15, width, 30);
        ctx.strokeStyle = "rgba(16, 185, 129, 0.2)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, sy);
        ctx.lineTo(width, sy);
        ctx.stroke();
      }

      // Draw Nodes/Points
      projected.forEach((node) => {
        // Scale size by depth
        let radius = 2.5 * node.scale;
        if (node.isCore) radius = 8 * node.scale;
        else if (node.id !== undefined) radius = 5 * node.scale; // Evidence nodes

        // Halftone mode scales based on Z-depth for 3D dot-matrix look
        if (mode === "HALFTONE") {
          const depthScale = (1 - node.z3d / 300) * 1.5;
          radius = (node.isCore ? 12 : node.id !== undefined ? 6 : 2.5) * depthScale * node.scale;
        }

        ctx.beginPath();
        ctx.arc(node.px, node.py, Math.max(0.5, radius), 0, Math.PI * 2);

        // Select styles based on node properties
        let fillStyle = "rgba(255, 255, 255, 0.4)";
        let strokeStyle = "rgba(255, 255, 255, 0.1)";
        let glow = false;

        if (node.isCore) {
          fillStyle = "#ffffff";
          strokeStyle = "rgba(255, 255, 255, 0.4)";
          glow = true;
        } else if (node.id !== undefined) {
          // Evidence node
          if (hasAudited) {
            if (node.status === "VERIFIED") {
              fillStyle = "#10b981"; // Emerald green
              strokeStyle = "rgba(16, 185, 129, 0.6)";
              glow = true;
            } else if (node.status === "TAMPERED") {
              fillStyle = "#ef4444"; // Red
              strokeStyle = "rgba(239, 68, 68, 0.8)";
              glow = true;
            } else {
              fillStyle = "#f59e0b"; // Amber warning
              strokeStyle = "rgba(245, 158, 11, 0.6)";
            }
          } else {
            fillStyle = "#6366f1"; // Indigo
            strokeStyle = "rgba(99, 102, 241, 0.5)";
          }
        } else {
          // Background cosmetic dot
          const alpha = Math.max(0.05, (1 - node.z3d / 300) * 0.25);
          fillStyle = `rgba(99, 102, 241, ${alpha})`;
          strokeStyle = "transparent";
        }

        ctx.fillStyle = fillStyle;
        ctx.fill();
        if (strokeStyle !== "transparent") {
          ctx.strokeStyle = strokeStyle;
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Draw outer glow rings
        if (glow) {
          ctx.beginPath();
          const pulseFactor = 1 + Math.sin(Date.now() * 0.005 + (node.pulse || 0)) * 0.25;
          ctx.arc(node.px, node.py, radius * 2.2 * pulseFactor, 0, Math.PI * 2);
          ctx.strokeStyle = node.isCore
            ? "rgba(255, 255, 255, 0.08)"
            : node.status === "TAMPERED"
            ? "rgba(239, 68, 68, 0.15)"
            : "rgba(16, 185, 129, 0.15)";
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Label rendering
        if (node.label && (node.isCore || node.id !== undefined || mode !== "HALFTONE")) {
          // Fade text with depth
          const textAlpha = Math.max(0.1, (1 - node.z3d / 300) * 0.85);
          ctx.fillStyle = node.isCore
            ? `rgba(255, 255, 255, ${textAlpha})`
            : node.status === "TAMPERED"
            ? `rgba(239, 68, 68, ${textAlpha})`
            : node.status === "VERIFIED"
            ? `rgba(16, 185, 129, ${textAlpha})`
            : `rgba(203, 213, 225, ${textAlpha * 0.85})`;

          ctx.font = node.isCore
            ? "bold 10px 'JetBrains Mono', monospace"
            : "8px 'JetBrains Mono', monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillText(node.label, node.px, node.py + radius + 5);
        }
      });

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, [nodes, mode, hasAudited, caseTitle]);

  return (
    <div ref={containerRef} className="absolute inset-0 w-full h-full z-0 overflow-hidden pointer-events-none">
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}
