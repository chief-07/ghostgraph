/**
 * GhostGraph High-Performance Dynamic Canvas Graph Engine
 * High-DPI anti-aliased graph visualizer supporting dynamic node/edge addition,
 * live spring physics, multi-agent query pulses, and state transitions.
 */

class GhostCanvasGraph {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.nodes = new Map();
    this.edges = [];
    this.particles = [];

    // Camera view transform
    this.panX = 0;
    this.panY = 0;
    this.zoom = 1.0;
    this.isDragging = false;
    this.draggedNode = null;
    this.lastMouseX = 0;
    this.lastMouseY = 0;

    // Simulation & layout
    this.animationFrameId = null;
    this.physicsRunning = true;
    this.simulationTicks = 0;

    // Clean White / Slate Palette
    this.colors = {
      bg: "#ffffff",
      grid: "#f1f5f9",
      edgeDefault: "#cbd5e1",
      edgeCalls: "#0284c7",
      edgeReads: "#d97706",
      edgeWrites: "#ef4444",
      edgeTests: "#16a34a",
      nodeProgram: "#0f172a",
      nodeFunction: "#0284c7",
      nodeMemory: "#d97706",
      nodeTestCase: "#16a34a",
      nodeVerified: "#16a34a",
      nodeFailed: "#dc2626",
      nodeInner: "#ffffff",
      text: "#1e293b",
      textMuted: "#64748b"
    };

    this.initEvents();
    this.resize();
    this.startLoop();
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.width = rect.width;
    this.height = Math.max(480, rect.height || 480);

    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;

    this.ctx.scale(dpr, dpr);
    this.draw();
  }

  initEvents() {
    window.addEventListener("resize", () => this.resize());

    // Mouse Dragging (Pan or Node Drag)
    this.canvas.addEventListener("mousedown", (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const graphX = (mouseX - this.panX) / this.zoom;
      const graphY = (mouseY - this.panY) / this.zoom;

      this.draggedNode = this.getNodeAt(graphX, graphY);
      this.isDragging = true;
      this.lastMouseX = mouseX;
      this.lastMouseY = mouseY;
    });

    window.addEventListener("mousemove", (e) => {
      if (!this.isDragging) return;
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const dx = mouseX - this.lastMouseX;
      const dy = mouseY - this.lastMouseY;

      if (this.draggedNode) {
        this.draggedNode.x += dx / this.zoom;
        this.draggedNode.y += dy / this.zoom;
        this.draggedNode.vx = 0;
        this.draggedNode.vy = 0;
      } else {
        this.panX += dx;
        this.panY += dy;
      }

      this.lastMouseX = mouseX;
      this.lastMouseY = mouseY;
    });

    window.addEventListener("mouseup", () => {
      this.isDragging = false;
      this.draggedNode = null;
    });

    // Zoom on Wheel
    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
      const newZoom = Math.max(0.25, Math.min(3.0, this.zoom * zoomFactor));

      this.panX = mouseX - (mouseX - this.panX) * (newZoom / this.zoom);
      this.panY = mouseY - (mouseY - this.panY) * (newZoom / this.zoom);
      this.zoom = newZoom;
    }, { passive: false });
  }

  getNodeAt(x, y) {
    for (const node of this.nodes.values()) {
      const dist = Math.hypot(node.x - x, node.y - y);
      if (dist <= node.radius + 8) {
        return node;
      }
    }
    return null;
  }

  clear() {
    this.nodes.clear();
    this.edges = [];
    this.particles = [];
    this.simulationTicks = 0;
    this.physicsRunning = true;
    this.panX = 0;
    this.panY = 0;
    this.zoom = 1.0;
  }

  addNode({ id, label, type = "function", status = "default", address = "" }) {
    if (this.nodes.has(id)) {
      const existing = this.nodes.get(id);
      if (label) existing.label = label;
      if (status) existing.status = status;
      return existing;
    }

    const tierY = {
      program: 60,
      function: 180,
      memory: 300,
      testcase: 420
    };

    const count = Array.from(this.nodes.values()).filter(n => n.type === type).length;
    const radius = type === "program" ? 22 : type === "function" ? 18 : type === "memory" ? 16 : 14;

    const node = {
      id: id,
      label: label || id,
      type: type,
      address: address,
      x: 180 + count * 130 + (Math.random() * 20 - 10),
      y: (tierY[type] || 200) + (Math.random() * 20 - 10),
      vx: (Math.random() - 0.5) * 4,
      vy: (Math.random() - 0.5) * 4,
      radius: radius,
      status: status
    };

    this.nodes.set(id, node);
    this.simulationTicks = 0;
    this.physicsRunning = true;
    this.fit();
    return node;
  }

  addEdge({ source, target, label = "CALLS", status = "default" }) {
    const exists = this.edges.some(e => e.source === source && e.target === target && e.label === label);
    if (!exists) {
      this.edges.push({
        source,
        target,
        label,
        status
      });
      this.simulationTicks = 0;
      this.physicsRunning = true;
    }
  }

  updateNode(id, updates) {
    const node = this.nodes.get(id);
    if (node) {
      Object.assign(node, updates);
    }
  }

  pulseEdge(sourceId, targetId, color = "#22c55e") {
    this.particles.push({
      sourceId,
      targetId,
      progress: 0,
      speed: 0.04 + Math.random() * 0.02,
      color: color
    });
  }

  setAllStatus(status) {
    for (const node of this.nodes.values()) {
      node.status = status;
    }
    for (const edge of this.edges) {
      edge.status = status;
    }
  }

  fit() {
    if (this.nodes.size === 0) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const node of this.nodes.values()) {
      minX = Math.min(minX, node.x - node.radius);
      maxX = Math.max(maxX, node.x + node.radius);
      minY = Math.min(minY, node.y - node.radius);
      maxY = Math.max(maxY, node.y + node.radius);
    }

    const padding = 70;
    const graphW = maxX - minX || 1;
    const graphH = maxY - minY || 1;

    const scaleX = (this.width - padding * 2) / graphW;
    const scaleY = (this.height - padding * 2) / graphH;
    this.zoom = Math.max(0.4, Math.min(1.1, Math.min(scaleX, scaleY)));

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    this.panX = (this.width / 2) - (centerX * this.zoom);
    this.panY = (this.height / 2) - (centerY * this.zoom);
  }

  stepPhysics() {
    if (!this.physicsRunning) return;
    this.simulationTicks++;
    if (this.simulationTicks > 120) {
      this.physicsRunning = false;
      return;
    }

    const kRepel = 2200;
    const kSpring = 0.04;
    const damping = 0.85;

    const nodeList = Array.from(this.nodes.values());

    for (let i = 0; i < nodeList.length; i++) {
      for (let j = i + 1; j < nodeList.length; j++) {
        const n1 = nodeList[i];
        const n2 = nodeList[j];
        const dx = n2.x - n1.x;
        const dy = n2.y - n1.y;
        const dist = Math.hypot(dx, dy) || 1;
        if (dist < 240) {
          const force = kRepel / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          if (n1 !== this.draggedNode) { n1.vx -= fx; n1.vy -= fy; }
          if (n2 !== this.draggedNode) { n2.vx += fx; n2.vy += fy; }
        }
      }
    }

    for (const edge of this.edges) {
      const src = this.nodes.get(edge.source);
      const tgt = this.nodes.get(edge.target);
      if (!src || !tgt) continue;

      const dx = tgt.x - src.x;
      const dy = tgt.y - src.y;
      const dist = Math.hypot(dx, dy) || 1;
      const desiredDist = 120;
      const force = (dist - desiredDist) * kSpring;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      if (src !== this.draggedNode) { src.vx += fx; src.vy += fy; }
      if (tgt !== this.draggedNode) { tgt.vx -= fx; tgt.vy -= fy; }
    }

    for (const node of nodeList) {
      if (node === this.draggedNode) continue;
      node.vx *= damping;
      node.vy *= damping;
      node.x += node.vx;
      node.y += node.vy;
    }
  }

  updateParticles() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.progress += p.speed;
      if (p.progress >= 1.0) {
        this.particles.splice(i, 1);
      }
    }
  }

  draw() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const dpr = window.devicePixelRatio || 1;
    ctx.scale(dpr, dpr);

    // Deep Charcoal Background
    ctx.fillStyle = this.colors.bg;
    ctx.fillRect(0, 0, w, h);

    // Subtle Coordinate Grid
    ctx.strokeStyle = this.colors.grid;
    ctx.lineWidth = 1;
    const gridSize = 32 * this.zoom;
    const startX = this.panX % gridSize;
    const startY = this.panY % gridSize;

    ctx.beginPath();
    for (let x = startX; x < w; x += gridSize) {
      ctx.moveTo(x, 0); ctx.lineTo(x, h);
    }
    for (let y = startY; y < h; y += gridSize) {
      ctx.moveTo(0, y); ctx.lineTo(w, y);
    }
    ctx.stroke();

    // Camera Transform
    ctx.translate(this.panX, this.panY);
    ctx.scale(this.zoom, this.zoom);

    // 1. Draw Edges
    for (const edge of this.edges) {
      const src = this.nodes.get(edge.source);
      const tgt = this.nodes.get(edge.target);
      if (!src || !tgt) continue;

      let edgeColor = this.colors.edgeDefault;
      if (edge.label === "CALLS") edgeColor = this.colors.edgeCalls;
      else if (edge.label === "READS") edgeColor = this.colors.edgeReads;
      else if (edge.label === "WRITES") edgeColor = this.colors.edgeWrites;
      else if (edge.label === "TESTS") edgeColor = this.colors.edgeTests;

      if (edge.status === "verified") edgeColor = this.colors.nodeVerified;
      if (edge.status === "failed") edgeColor = this.colors.nodeFailed;

      ctx.strokeStyle = edgeColor;
      ctx.lineWidth = edge.status === "verified" ? 2.0 : 1.4;

      if (edge.label === "READS") {
        ctx.setLineDash([4, 4]);
      } else {
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(tgt.x, tgt.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw Directional Arrow
      const angle = Math.atan2(tgt.y - src.y, tgt.x - src.x);
      const arrowDist = tgt.radius + 3;
      const arrowX = tgt.x - Math.cos(angle) * arrowDist;
      const arrowY = tgt.y - Math.sin(angle) * arrowDist;

      ctx.fillStyle = edgeColor;
      ctx.beginPath();
      ctx.moveTo(arrowX, arrowY);
      ctx.lineTo(
        arrowX - 8 * Math.cos(angle - Math.PI / 7),
        arrowY - 8 * Math.sin(angle - Math.PI / 7)
      );
      ctx.lineTo(
        arrowX - 8 * Math.cos(angle + Math.PI / 7),
        arrowY - 8 * Math.sin(angle + Math.PI / 7)
      );
      ctx.closePath();
      ctx.fill();

      // Label at Midpoint
      const midX = (src.x + tgt.x) / 2;
      const midY = (src.y + tgt.y) / 2;
      ctx.font = "9px monospace";
      ctx.fillStyle = this.colors.textMuted;
      ctx.fillText(edge.label, midX + 4, midY - 4);
    }

    // 2. Draw Query Pulse Packets
    for (const p of this.particles) {
      const src = this.nodes.get(p.sourceId);
      const tgt = this.nodes.get(p.targetId);
      if (!src || !tgt) continue;

      const curX = src.x + (tgt.x - src.x) * p.progress;
      const curY = src.y + (tgt.y - src.y) * p.progress;

      ctx.save();
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(curX, curY, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 3. Draw Nodes
    for (const node of this.nodes.values()) {
      let strokeColor = this.colors.nodeFunction;
      let glyph = "fn";

      if (node.type === "program") {
        strokeColor = this.colors.nodeProgram;
        glyph = "BIN";
      } else if (node.type === "memory") {
        strokeColor = this.colors.nodeMemory;
        glyph = "0x";
      } else if (node.type === "testcase") {
        strokeColor = node.status === "FAILED" ? this.colors.nodeFailed : this.colors.nodeTestCase;
        glyph = node.status === "FAILED" ? "✕" : "tc";
      }

      if (node.status === "verified" || node.status === "PASSED") {
        strokeColor = this.colors.nodeVerified;
        glyph = "✓";
      } else if (node.status === "failed" || node.status === "FAILED") {
        strokeColor = this.colors.nodeFailed;
        glyph = "✕";
      }

      ctx.save();
      if (node.status === "verified" || node.status === "PASSED" || node.status === "resolved") {
        ctx.shadowColor = strokeColor;
        ctx.shadowBlur = 14;
      }

      // Dark Charcoal Center
      ctx.fillStyle = this.colors.nodeInner;
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fill();

      // Outer Rim
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = (node.status === "verified" || node.status === "PASSED") ? 2.5 : 1.8;
      ctx.stroke();
      ctx.restore();

      // Center Glyph
      ctx.font = "bold 9px monospace";
      ctx.fillStyle = strokeColor;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(glyph, node.x, node.y);

      // Label Underneath
      ctx.font = "10px monospace";
      ctx.fillStyle = (node.status === "verified" || node.status === "PASSED") ? "#16a34a" : this.colors.text;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(node.label, node.x, node.y + node.radius + 5);
    }

    ctx.restore();
  }

  startLoop() {
    const loop = () => {
      this.stepPhysics();
      this.updateParticles();
      this.draw();
      this.animationFrameId = requestAnimationFrame(loop);
    };
    loop();
  }

  destroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }
}

window.GhostCanvasGraph = GhostCanvasGraph;
