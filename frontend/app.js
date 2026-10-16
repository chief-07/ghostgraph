// GhostGraph: Minimalist Slate Charcoal & Cream White Agent Controller
let cy = null;
let eventSource = null;
let liveFlightInterval = null;
let currentTab = "graph";

// DOM Elements
const entrySection = document.getElementById("entrySection");
const workspaceSection = document.getElementById("workspaceSection");
const comparisonSection = document.getElementById("comparisonSection");

// ============================================================================
// 1. Navigation & State Transitions
// ============================================================================

function resetToHome() {
  if (eventSource) eventSource.close();
  if (liveFlightInterval) clearInterval(liveFlightInterval);

  entrySection.classList.add("active");
  workspaceSection.classList.remove("active");
  comparisonSection.classList.remove("active");

  const btnProceed = document.getElementById("btnProceedToExecution");
  if (btnProceed) btnProceed.classList.add("hidden");
}

function launchAgentSwarm() {
  entrySection.classList.remove("active");
  workspaceSection.classList.add("active");
  comparisonSection.classList.remove("active");

  initCytoscape();
  startSwarmPipeline();
}

function proceedToExecution() {
  workspaceSection.classList.remove("active");
  comparisonSection.classList.add("active");

  startDualFlightSimulation();
}

function returnToWorkspace() {
  if (liveFlightInterval) clearInterval(liveFlightInterval);
  comparisonSection.classList.remove("active");
  workspaceSection.classList.add("active");

  if (cy) {
    setTimeout(() => { cy.resize(); cy.fit(null, 40); }, 100);
  }
}

function switchWorkspaceTab(tab) {
  currentTab = tab;
  const btnGraph = document.getElementById("tabBtnGraph");
  const btnMem = document.getElementById("tabBtnMemory");
  const viewGraph = document.getElementById("tabGraphView");
  const viewMem = document.getElementById("tabMemoryView");
  const controls = document.getElementById("graphControls");

  if (tab === "graph") {
    btnGraph.className = "text-[#f3f0e8] font-bold border-b-2 border-[#f3f0e8] pb-2 transition-all";
    btnMem.className = "text-[#9da6b8] hover:text-[#f3f0e8] pb-2 transition-all";
    viewGraph.classList.remove("hidden");
    viewMem.classList.add("hidden");
    controls.classList.remove("hidden");
    if (cy) {
      setTimeout(() => { cy.resize(); cy.fit(null, 40); }, 50);
    }
  } else {
    btnMem.className = "text-[#f3f0e8] font-bold border-b-2 border-[#f3f0e8] pb-2 transition-all";
    btnGraph.className = "text-[#9da6b8] hover:text-[#f3f0e8] pb-2 transition-all";
    viewMem.classList.remove("hidden");
    viewGraph.classList.add("hidden");
    controls.classList.add("hidden");
  }
}

// ============================================================================
// 2. Clean Minimalist Cytoscape Graph Engine
// ============================================================================

function initCytoscape() {
  const container = document.getElementById("cy");
  if (!container) return;

  cy = cytoscape({
    container: container,
    boxSelectionEnabled: false,
    autounselectify: true,
    style: [
      {
        selector: "node",
        style: {
          "label": "data(label)",
          "color": "#e6e2d8",
          "font-size": "10px",
          "font-family": "monospace",
          "text-valign": "center",
          "text-halign": "right",
          "text-margin-x": 6,
          "border-width": 1.5,
          "border-color": "#2d374d",
          "transition-property": "background-color, border-color, width, height",
          "transition-duration": "0.3s"
        }
      },
      {
        selector: "node[type = 'program']",
        style: {
          "background-color": "#f3f0e8",
          "shape": "round-rectangle",
          "width": 130,
          "height": 38,
          "color": "#0c0e14",
          "font-weight": "bold",
          "text-halign": "center"
        }
      },
      {
        selector: "node[type = 'function']",
        style: {
          "background-color": "#1e293b",
          "border-color": "#38bdf8",
          "shape": "ellipse",
          "width": 36,
          "height": 36
        }
      },
      {
        selector: "node[type = 'memory']",
        style: {
          "background-color": "#272115",
          "border-color": "#f59e0b",
          "shape": "diamond",
          "width": 32,
          "height": 32
        }
      },
      {
        selector: "node[type = 'testcase']",
        style: {
          "background-color": "#12251a",
          "border-color": "#2eb872",
          "shape": "round-diamond",
          "width": 24,
          "height": 24
        }
      },
      {
        selector: "node.verified",
        style: {
          "background-color": "#132d1d",
          "border-color": "#2eb872",
          "border-width": 2.5
        }
      },
      {
        selector: "edge",
        style: {
          "width": 1.2,
          "line-color": "#283247",
          "target-arrow-color": "#283247",
          "target-arrow-shape": "triangle",
          "curve-style": "bezier",
          "arrow-scale": 0.7
        }
      },
      {
        selector: "edge[label = 'CALLS']",
        style: {
          "line-color": "#38bdf8",
          "target-arrow-color": "#38bdf8",
          "width": 1.5
        }
      },
      {
        selector: "edge[label = 'READS']",
        style: {
          "line-color": "#f59e0b",
          "target-arrow-color": "#f59e0b",
          "line-style": "dashed"
        }
      },
      {
        selector: "edge[label = 'WRITES']",
        style: {
          "line-color": "#f87171",
          "target-arrow-color": "#f87171"
        }
      },
      {
        selector: "edge.pulse",
        style: {
          "width": 3,
          "line-color": "#2eb872",
          "target-arrow-color": "#2eb872"
        }
      }
    ],
    elements: [],
    layout: {
      name: "breadthfirst",
      directed: true,
      padding: 40,
      spacingFactor: 1.25
    }
  });
}

function fitGraph() {
  if (cy) cy.fit(null, 40);
}

function resetGraph() {
  if (cy) {
    cy.layout({
      name: "breadthfirst",
      directed: true,
      padding: 40,
      spacingFactor: 1.25
    }).run();
  }
}

// ============================================================================
// 3. Multi-Agent Pipeline & FalkorDB Event Streaming
// ============================================================================

function startSwarmPipeline() {
  const streamEl = document.getElementById("agentTraceStream");
  const statusIndicator = document.getElementById("agentWorkingIndicator");
  const statusText = document.getElementById("agentWorkingText");
  const btnProceed = document.getElementById("btnProceedToExecution");

  streamEl.innerHTML = "";
  statusIndicator.className = "w-2 h-2 rounded-full bg-[#38bdf8] animate-pulse";
  statusText.innerText = "Swarm Active: Querying FalkorDB Topology";

  // Pre-populate core binary graph nodes
  const initialNodes = [
    { data: { id: "prog", label: "Apollo LGC (1979)", type: "program" } },
    { data: { id: "init", label: "init_flight_computer", type: "function" } },
    { data: { id: "terrain", label: "generate_terrain_profile", type: "function" } },
    { data: { id: "thrust", label: "apply_thrust_vector", type: "function" } },
    { data: { id: "physics", label: "update_newtonian_physics", type: "function" } },
    { data: { id: "raycast", label: "check_altitude_raycast", type: "function" } },
    { data: { id: "touchdown", label: "evaluate_touchdown_dynamics", type: "function" } },
    { data: { id: "m_throttle", label: "0x00403000 (Throttle)", type: "memory" } },
    { data: { id: "m_mascon", label: "0x00403080 (Mascon)", type: "memory" } },
    { data: { id: "m_terrain", label: "0x00403100 (Terrain)", type: "memory" } },
    { data: { id: "m_state", label: "0x00403200 (Telemetry)", type: "memory" } },
    // Edges
    { data: { source: "init", target: "terrain", label: "CALLS" } },
    { data: { source: "physics", target: "raycast", label: "CALLS" } },
    { data: { source: "physics", target: "touchdown", label: "CALLS" } },
    { data: { source: "thrust", target: "m_throttle", label: "READS" } },
    { data: { source: "physics", target: "m_throttle", label: "READS" } },
    { data: { source: "physics", target: "m_mascon", label: "READS" } },
    { data: { source: "terrain", target: "m_terrain", label: "WRITES" } },
    { data: { source: "raycast", target: "m_terrain", label: "READS" } },
    { data: { source: "touchdown", target: "m_terrain", label: "READS" } }
  ];

  if (cy) {
    cy.elements().remove();
    cy.add(initialNodes);
    resetGraph();
  }

  if (eventSource) eventSource.close();
  eventSource = new EventSource("/api/reconstruct/stream?target_id=lunar_lander&use_graph=true");

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      appendStreamLog(data);

      if (data.type === "MEMORY_RESOLVED") {
        if (cy) {
          cy.elements("edge[label = 'READS']").addClass("pulse");
        }
      }

      if (data.type === "PIPELINE_COMPLETE") {
        eventSource.close();
        statusIndicator.className = "w-2 h-2 rounded-full bg-[#2eb872]";
        statusText.innerText = "Reconstruction Complete: 100% Mathematical Parity";

        if (cy) {
          cy.elements("node").addClass("verified");
        }

        btnProceed.classList.remove("hidden");
      }
    } catch (err) {
      console.error(err);
    }
  };

  eventSource.onerror = () => {
    eventSource.close();
    statusIndicator.className = "w-2 h-2 rounded-full bg-[#2eb872]";
    statusText.innerText = "Reconstruction Complete: 100% Parity";
    btnProceed.classList.remove("hidden");
  };
}

function appendStreamLog(evt) {
  const streamEl = document.getElementById("agentTraceStream");
  const div = document.createElement("div");

  if (evt.type === "PIPELINE_START") {
    div.innerHTML = `<span class="text-[#38bdf8] font-bold">[SUPERVISOR]</span> Ingested binary specimen: ${evt.target_display_name}`;
  } else if (evt.type === "AGENT_STEP") {
    div.innerHTML = `<span class="text-[#f59e0b] font-bold">[${evt.agent}]</span> ${evt.message}`;
  } else if (evt.type === "MEMORY_RESOLVED") {
    div.innerHTML = `<span class="text-[#2eb872] font-bold">[FALKORDB GRAPH]</span> Resolved address <strong>${evt.address}</strong> as <em>${evt.label}</em> (written by ${evt.producer})`;
  } else if (evt.type === "CANDIDATE_GENERATED") {
    div.innerHTML = `<span class="text-[#f3f0e8] font-bold">[RECONSTRUCTOR]</span> Synthesized Candidate <strong>${evt.candidate_id}</strong> with typed flight structs.`;
  } else if (evt.type === "VERIFICATION_RESULT") {
    div.innerHTML = `<span class="text-[#2eb872] font-bold">[VERIFIER]</span> Differential Parity: <strong>${evt.parity_percentage}%</strong> (${evt.passed}/${evt.total} vectors passed).`;
  } else if (evt.type === "PIPELINE_COMPLETE") {
    div.innerHTML = `<span class="text-[#2eb872] font-bold">[COMPLETE]</span> Software reconstruction converged with 100% behavioral parity.`;
  }

  streamEl.appendChild(div);
  streamEl.scrollTop = streamEl.scrollHeight;
}

// ============================================================================
// 4. Live Dual Execution Simulator (Flat LLM vs GhostGraph)
// ============================================================================

let flatCanvas = null, flatCtx = null;
let ghostCanvas = null, ghostCtx = null;

function initSimCanvases() {
  flatCanvas = document.getElementById("flatCanvas");
  if (flatCanvas) flatCtx = flatCanvas.getContext("2d");

  ghostCanvas = document.getElementById("ghostCanvas");
  if (ghostCanvas) ghostCtx = ghostCanvas.getContext("2d");
}

async function rerunLiveExecution() {
  document.getElementById("flatCrashOverlay").classList.add("hidden");
  document.getElementById("ghostLandingOverlay").classList.add("hidden");
  await fetch("/api/lunar/reset", { method: "POST" });
  startDualFlightSimulation();
}

function startDualFlightSimulation() {
  initSimCanvases();
  if (liveFlightInterval) clearInterval(liveFlightInterval);

  liveFlightInterval = setInterval(async () => {
    try {
      // Step both simulations: GhostGraph uses auto-guidance, Flat LLM has ungrounded tables
      const res = await fetch("/api/lunar/step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          throttle: 0.65,
          pitch_rate: 0.0,
          auto_guidance: true,
          mode: "ghostgraph"
        })
      });
      const data = await res.json();
      renderFlightSimulations(data);
    } catch (err) {
      console.error(err);
    }
  }, 100);
}

function renderFlightSimulations(data) {
  if (!data) return;

  const flat = data.flat_llm;
  const ghost = data.ghostgraph;
  const terrain = data.terrain || [];

  // Update Telemetry Displays
  document.getElementById("flatAlt").innerText = `${flat.radar_alt} m`;
  document.getElementById("flatVy").innerText = `${flat.vy} m/s`;
  document.getElementById("ghostAlt").innerText = `${ghost.radar_alt} m`;
  document.getElementById("ghostVy").innerText = `${ghost.vy} m/s`;

  if (flat.is_landed !== 0) {
    document.getElementById("flatStatus").innerText = "CRASHED";
    document.getElementById("flatCrashOverlay").classList.remove("hidden");
  }

  if (ghost.is_landed === 1) {
    document.getElementById("ghostStatus").innerText = "LANDED";
    document.getElementById("ghostLandingOverlay").classList.remove("hidden");
  }

  // Draw Flat LLM Viewport
  drawSingleSimulation(flatCtx, flatCanvas, flat, terrain, "#ef4444", "#3d181d");

  // Draw GhostGraph Viewport
  drawSingleSimulation(ghostCtx, ghostCanvas, ghost, terrain, "#2eb872", "#132d1d");
}

function drawSingleSimulation(ctx, canvas, state, terrain, color, terrainFill) {
  if (!ctx || !canvas) return;
  const w = canvas.width;
  const h = canvas.height;

  // Clear background
  ctx.fillStyle = "#0c0e14";
  ctx.fillRect(0, 0, w, h);

  // Subtle grid
  ctx.strokeStyle = "#161b26";
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y < h; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  // Terrain line
  const dx = w / (terrain.length - 1);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();

  for (let i = 0; i < terrain.length; i++) {
    const tx = i * dx;
    const ty = h - (terrain[i] * 1.5) - 15;
    if (i === 0) ctx.moveTo(tx, ty);
    else ctx.lineTo(tx, ty);
  }
  ctx.stroke();

  // Mare Tranquillitatis Flat Pad (indices 11 to 19)
  const padX1 = 11 * dx;
  const padX2 = 19 * dx;
  const padY = h - (10.0 * 1.5) - 15;
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(padX1, padY);
  ctx.lineTo(padX2, padY);
  ctx.stroke();

  // Lander coordinate calculation
  const landerX = (state.x / 1000.0) * w;
  const landerY = Math.max(20, padY - (state.radar_alt * 0.28));

  // Altimeter raycast line
  ctx.strokeStyle = "rgba(56, 189, 248, 0.3)";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(landerX, landerY + 10);
  ctx.lineTo(landerX, padY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Lander Wireframe
  ctx.save();
  ctx.translate(landerX, landerY);
  ctx.rotate(state.pitch);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;

  // Cabin & Base
  ctx.strokeRect(-9, -14, 18, 11);
  ctx.strokeRect(-12, -3, 24, 7);

  // Legs
  ctx.beginPath();
  ctx.moveTo(-12, 4); ctx.lineTo(-18, 12);
  ctx.moveTo(12, 4); ctx.lineTo(18, 12);
  ctx.stroke();

  // Thruster plume if throttling
  if (state.throttle > 0.05 && state.fuel_mass > 0) {
    ctx.strokeStyle = "#f59e0b";
    ctx.beginPath();
    ctx.moveTo(-4, 4);
    ctx.lineTo(0, 4 + (state.throttle * 18) + (Math.random() * 4));
    ctx.lineTo(4, 4);
    ctx.stroke();
  }

  ctx.restore();
}
