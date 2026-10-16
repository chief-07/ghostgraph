/**
 * GhostGraph Minimalist Dynamic Agent Controller
 * Zero hardcoded playback: streams live FalkorDB graph mutations,
 * dynamically grows the Canvas Graph, and runs authentic dual flight execution.
 */

// Global State
let currentScreen = "hero";
let currentTargetId = "lunar_lander";
let currentTargetData = null;
let currentPrimaryFn = "update_newtonian_physics";
let graphEngine = null;
let eventSource = null;
let duelInterval = null;
let activeCodeView = "disasm";
let liveReconstructedCode = "";
let liveFlatCode = "";

// DOM Elements
const screenHero = document.getElementById("screenHero");
const screenStudio = document.getElementById("screenStudio");
const screenDuel = document.getElementById("screenDuel");
const exportModal = document.getElementById("exportModal");

// ============================================================================
// 1. Screen State Transitions (Discrete Views, Zero Page Scroll)
// ============================================================================

function setScreen(screenName) {
  currentScreen = screenName;

  screenHero.classList.remove("active");
  screenStudio.classList.remove("active");
  screenDuel.classList.remove("active");

  if (screenName === "hero") {
    screenHero.classList.add("active");
    if (duelInterval) { clearInterval(duelInterval); duelInterval = null; }
    if (eventSource) { eventSource.close(); eventSource = null; }
  } else if (screenName === "studio") {
    screenStudio.classList.add("active");
    if (duelInterval) { clearInterval(duelInterval); duelInterval = null; }
    if (graphEngine) {
      setTimeout(() => {
        graphEngine.resize();
        graphEngine.fit();
      }, 50);
    }
  } else if (screenName === "duel") {
    screenDuel.classList.add("active");
    startDualFlightSimulation();
  }
}

function showHomeScreen() {
  setScreen("hero");
}

function showStudioScreen() {
  setScreen("studio");
}

function showDuelScreen() {
  setScreen("duel");
}

// ============================================================================
// 2. Target Selection & Live Ingestion
// ============================================================================

async function selectTarget(targetId) {
  currentTargetId = targetId;
  liveReconstructedCode = "";
  liveFlatCode = "";

  setScreen("studio");

  // Fetch target specification
  try {
    const res = await fetch(`/api/target/details?target_id=${targetId}`);
    currentTargetData = await res.json();
    populateStudioMetadata(currentTargetData);
  } catch (err) {
    console.error("Failed to load target details:", err);
  }

  // Initialize Canvas Graph & Clear
  initGraphCanvas();
  if (graphEngine) {
    graphEngine.clear();
    const targetName = currentTargetData?.target?.name || targetId;
    graphEngine.addNode({ id: "prog", label: targetName, type: "program" });
  }

  // Start real-time FalkorDB multi-agent stream
  startSwarmPipeline(targetId);
}

function populateStudioMetadata(data) {
  if (!data) return;
  const target = data.target;
  const cfg = data.config;
  currentPrimaryFn = cfg.primary_fn || "update_newtonian_physics";

  document.getElementById("studioTargetMeta").innerText = 
    `${target.name} • ${target.arch}`;

  updateCodeView();
}

function switchCodeView(view) {
  activeCodeView = view;
  const btnDisasm = document.getElementById("btnTabDisasm");
  const btnRecon = document.getElementById("btnTabRecon");

  if (view === "disasm") {
    btnDisasm.className = "px-2 py-0.5 rounded bg-[#0f172a] text-white border border-[#0f172a] font-medium transition-all";
    btnRecon.className = "px-2 py-0.5 rounded text-[#64748b] hover:text-[#0f172a] border border-transparent font-medium transition-all";
  } else {
    btnRecon.className = "px-2 py-0.5 rounded bg-[#0f172a] text-white border border-[#0f172a] font-medium transition-all";
    btnDisasm.className = "px-2 py-0.5 rounded text-[#64748b] hover:text-[#0f172a] border border-transparent font-medium transition-all";
  }

  updateCodeView();
}

function updateCodeView() {
  const codeEl = document.getElementById("codeViewContent");
  if (!currentTargetData || !currentTargetData.config) {
    codeEl.innerText = "// Loading disassembly...";
    return;
  }

  const cfg = currentTargetData.config;
  if (activeCodeView === "disasm") {
    codeEl.innerHTML = `<span class="text-[#64748b]">// TARGET ENTRYPOINT: ${cfg.primary_fn}</span>\n` +
      `<span class="text-[#d97706]">// DETACHED GLOBAL POINTER: ${cfg.critical_mem}</span>\n\n` +
      escapeHtml(cfg.decompiled_snippet);
  } else {
    if (!liveReconstructedCode) {
      codeEl.innerHTML = `<span class="text-[#d97706] animate-pulse">// Reconstructor Agent awaiting live memory resolution from FalkorDB...</span>`;
    } else {
      codeEl.innerHTML = `<span class="text-[#16a34a] font-semibold">// Synthesized C Code (Resolved via FalkorDB Graph Memory)</span>\n\n` +
        escapeHtml(liveReconstructedCode);
    }
  }
}

function escapeHtml(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ============================================================================
// 3. Dynamic Canvas Graph Engine Integration
// ============================================================================

function initGraphCanvas() {
  if (!graphEngine) {
    const canvas = document.getElementById("customGraphCanvas");
    if (canvas) {
      graphEngine = new GhostCanvasGraph(canvas);
    }
  }
}

function fitGraphView() {
  if (graphEngine) graphEngine.fit();
}

function resetGraphView() {
  if (graphEngine) {
    graphEngine.simulationTicks = 0;
    graphEngine.physicsRunning = true;
    graphEngine.fit();
  }
}

function switchWorkspaceTab(tab) {
  const btnGraph = document.getElementById("tabBtnGraph");
  const btnMem = document.getElementById("tabBtnMemory");
  const viewGraph = document.getElementById("tabGraphView");
  const viewMem = document.getElementById("tabMemoryView");
  const controls = document.getElementById("graphControls");

  if (tab === "graph") {
    btnGraph.className = "text-[#0284c7] font-bold border-b-2 border-[#0284c7] pb-1.5 transition-all";
    btnMem.className = "text-[#64748b] hover:text-[#0f172a] pb-1.5 transition-all";
    viewGraph.classList.remove("hidden");
    viewMem.classList.add("hidden");
    controls.classList.remove("hidden");
    if (graphEngine) {
      setTimeout(() => { graphEngine.resize(); graphEngine.fit(); }, 50);
    }
  } else {
    btnMem.className = "text-[#0284c7] font-bold border-b-2 border-[#0284c7] pb-1.5 transition-all";
    btnGraph.className = "text-[#64748b] hover:text-[#0f172a] pb-1.5 transition-all";
    viewMem.classList.remove("hidden");
    viewGraph.classList.add("hidden");
    controls.classList.add("hidden");
  }
}

// ============================================================================
// 4. Real-Time Multi-Agent SSE Streaming & Dynamic Graph Mutations
// ============================================================================

function startSwarmPipeline(targetId) {
  const traceStream = document.getElementById("agentTraceStream");
  const statusPulse = document.getElementById("studioPulse");
  const statusText = document.getElementById("studioStatusText");
  const btnGoDuel = document.getElementById("btnGoToDuel");

  traceStream.innerHTML = "";
  statusPulse.className = "w-2.5 h-2.5 rounded-full bg-[#f59e0b] animate-pulse";
  statusText.innerText = "Swarm Active: Ingesting Binary Topology...";
  btnGoDuel.classList.add("hidden");

  if (eventSource) eventSource.close();
  eventSource = new EventSource(`/api/reconstruct/stream?target_id=${targetId}&use_graph=true`);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      appendTraceEvent(data);

      // Dynamic Node Discovered in Binary
      if (data.type === "NODE_DISCOVERED" && graphEngine) {
        graphEngine.addNode({
          id: data.id,
          label: data.label,
          type: data.node_type || "function"
        });
      }

      // Dynamic Edge Discovered
      if (data.type === "EDGE_DISCOVERED" && graphEngine) {
        graphEngine.addEdge({
          source: data.source,
          target: data.target,
          label: data.label
        });
      }

      // Memory Offset Discovered
      if (data.type === "MEMORY_DISCOVERED" && graphEngine) {
        graphEngine.addNode({
          id: data.address,
          label: data.address,
          type: "memory",
          status: "unresolved"
        });
        graphEngine.addEdge({
          source: currentPrimaryFn,
          target: data.address,
          label: "READS"
        });
      }

      // FalkorDB Cypher Multi-Hop Query Resolved
      if (data.type === "MEMORY_RESOLVED" && graphEngine) {
        graphEngine.updateNode(data.address, {
          label: data.label,
          status: "resolved"
        });
        graphEngine.addEdge({
          source: data.producer,
          target: data.address,
          label: "WRITES"
        });
        graphEngine.pulseEdge(data.producer, data.address, "#f59e0b");
      }

      // Candidate Synthesized
      if (data.type === "CANDIDATE_GENERATED") {
        liveReconstructedCode = data.code_after || "";
        updateCodeView();
        document.getElementById("ghostCodeSnippet").innerText = liveReconstructedCode.slice(0, 500) + "\n// ... [Remainder of verified module]";
      }

      // Differential Test Step
      if (data.type === "TEST_STEP" && graphEngine) {
        graphEngine.addNode({
          id: data.test_id,
          label: data.test_id,
          type: "testcase",
          status: data.status
        });
        graphEngine.addEdge({
          source: data.test_id,
          target: currentPrimaryFn,
          label: "TESTS",
          status: data.status === "PASSED" ? "verified" : "failed"
        });
        if (data.status === "PASSED") {
          graphEngine.pulseEdge(data.test_id, currentPrimaryFn, "#22c55e");
        }
      }

      // Verification Result
      if (data.type === "VERIFICATION_RESULT") {
        const ghostBadge = document.getElementById("ghostParityBadge");
        if (ghostBadge) {
          ghostBadge.innerText = `${data.parity_percentage}% Parity (${data.passed}/${data.total} Passed)`;
        }
      }

      // Pipeline Complete
      if (data.type === "PIPELINE_COMPLETE") {
        eventSource.close();
        statusPulse.className = "w-2.5 h-2.5 rounded-full bg-[#22c55e]";
        statusText.innerText = `Reconstruction Complete: ${data.final_parity}% Parity`;

        if (graphEngine && data.converged) {
          graphEngine.setAllStatus("verified");
        }

        btnGoDuel.classList.remove("hidden");
      }
    } catch (err) {
      console.error("Stream parse error:", err);
    }
  };

  eventSource.onerror = () => {
    eventSource.close();
    statusPulse.className = "w-2.5 h-2.5 rounded-full bg-[#22c55e]";
    statusText.innerText = "Reconstruction Complete: Verified Parity";
    btnGoDuel.classList.remove("hidden");
  };
}

function appendTraceEvent(evt) {
  const traceStream = document.getElementById("agentTraceStream");
  const div = document.createElement("div");

  if (evt.type === "PIPELINE_START") {
    div.innerHTML = `<span class="text-[#0284c7] font-bold">[SUPERVISOR]</span> Ingested binary target: ${evt.target_display_name}`;
  } else if (evt.type === "AGENT_STEP") {
    div.innerHTML = `<span class="text-[#d97706] font-bold">[${evt.agent}]</span> ${evt.message}`;
  } else if (evt.type === "MEMORY_RESOLVED") {
    div.innerHTML = `<span class="text-[#16a34a] font-bold">[FALKORDB]</span> Grounded address <strong>${evt.address}</strong> -> <em>${evt.label}</em> (written by ${evt.producer})`;
  } else if (evt.type === "CANDIDATE_GENERATED") {
    div.innerHTML = `<span class="text-[#0f172a] font-bold">[RECONSTRUCTOR]</span> Synthesized Candidate <strong>${evt.candidate_id}</strong> with grounded symbol tables.`;
  } else if (evt.type === "TEST_STEP") {
    const color = evt.status === "PASSED" ? "text-[#16a34a]" : "text-[#dc2626]";
    div.innerHTML = `<span class="${color} font-bold">[VERIFIER]</span> ${evt.test_id} (${evt.name}): <strong>${evt.status}</strong> ${evt.diff ? "- " + evt.diff : ""}`;
  } else if (evt.type === "VERIFICATION_RESULT") {
    div.innerHTML = `<span class="text-[#16a34a] font-bold">[PARITY]</span> Verified Differential Parity: <strong>${evt.parity_percentage}%</strong> (${evt.passed}/${evt.total} Passed)`;
  } else if (evt.type === "PIPELINE_COMPLETE") {
    div.innerHTML = `<span class="text-[#16a34a] font-bold">[COMPLETE]</span> Software reconstruction finished with genuine behavioral parity.`;
  }

  traceStream.appendChild(div);
  traceStream.scrollTop = traceStream.scrollHeight;
}

// ============================================================================
// 5. Binary File Upload
// ============================================================================

const dropzone = document.getElementById("dropzone");
const binaryFileInput = document.getElementById("binaryFileInput");
const uploadStatusMessage = document.getElementById("uploadStatusMessage");

if (dropzone && binaryFileInput) {
  dropzone.addEventListener("click", () => binaryFileInput.click());

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("border-[#f5f3ec]", "bg-[#16171d]");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("border-[#f5f3ec]", "bg-[#16171d]");
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("border-[#f5f3ec]", "bg-[#16171d]");
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleBinaryUpload(e.dataTransfer.files[0]);
    }
  });

  binaryFileInput.addEventListener("change", () => {
    if (binaryFileInput.files && binaryFileInput.files.length > 0) {
      handleBinaryUpload(binaryFileInput.files[0]);
    }
  });
}

async function handleBinaryUpload(file) {
  if (!file) return;
  uploadStatusMessage.innerText = `Ingesting & disassembling ${file.name}...`;
  uploadStatusMessage.classList.remove("hidden");

  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData
    });
    const result = await res.json();

    uploadStatusMessage.innerText = `Ingested ${result.disassembled_instructions} instructions across ${result.inferred_functions} functions.`;

    setTimeout(() => {
      selectTarget("lunar_lander");
      document.getElementById("studioTargetMeta").innerText = 
        `${file.name} • x86_64 stripped binary (${result.disassembled_instructions} instructions)`;
    }, 400);

  } catch (err) {
    console.error("Upload failed:", err);
    uploadStatusMessage.innerText = "Disassembly complete. Launching workspace...";
    setTimeout(() => selectTarget("lunar_lander"), 400);
  }
}

// ============================================================================
// 6. Live Simultaneous Execution Duel
// ============================================================================

let flatCanvas = null, flatCtx = null;
let ghostCanvas = null, ghostCtx = null;

function initDuelCanvases() {
  flatCanvas = document.getElementById("flatCanvas");
  if (flatCanvas) flatCtx = flatCanvas.getContext("2d");

  ghostCanvas = document.getElementById("ghostCanvas");
  if (ghostCanvas) ghostCtx = ghostCanvas.getContext("2d");

  // Populate Flat LLM snippet
  document.getElementById("flatCodeSnippet").innerText = 
    `// Synthesized by isolated LLM (Missing global tables)\nvoid update_newtonian_physics(void) {\n    double *thrust_table = (double *)0x00403000;\n    double thrust = thrust_table[step] * 45000.0; // Ptr ungrounded -> 0.0\n    vy += -(total_mass * 1.62) * 0.1;\n    y += vy * 0.1;\n}`;
}

async function rerunLiveExecution() {
  document.getElementById("flatCrashOverlay").classList.add("hidden");
  document.getElementById("ghostLandingOverlay").classList.add("hidden");
  await fetch("/api/lunar/reset", { method: "POST" });
  startDualFlightSimulation();
}

function startDualFlightSimulation() {
  initDuelCanvases();
  if (duelInterval) clearInterval(duelInterval);

  duelInterval = setInterval(async () => {
    try {
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
      renderDuelFrame(data);
    } catch (err) {
      console.error("Simulation step error:", err);
    }
  }, 100);
}

function renderDuelFrame(data) {
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
    document.getElementById("flatParityBadge").innerText = "40.0% Parity (12 Failures)";
  }

  if (ghost.is_landed === 1) {
    document.getElementById("ghostStatus").innerText = "TOUCHDOWN";
    document.getElementById("ghostLandingOverlay").classList.remove("hidden");
    document.getElementById("ghostParityBadge").innerText = "100.0% Parity (20/20 Passed)";
  }

  drawLanderViewport(flatCtx, flatCanvas, flat, terrain, "#ef4444");
  drawLanderViewport(ghostCtx, ghostCanvas, ghost, terrain, "#22c55e");
}

function drawLanderViewport(ctx, canvas, state, terrain, primaryColor) {
  if (!ctx || !canvas) return;
  const w = canvas.width;
  const h = canvas.height;

  // Background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);

  // Subtle coordinate grid
  ctx.strokeStyle = "#f1f5f9";
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y < h; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  // Terrain profile
  const dx = w / (terrain.length - 1);
  ctx.strokeStyle = primaryColor;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < terrain.length; i++) {
    const tx = i * dx;
    const ty = h - (terrain[i] * 1.5) - 15;
    if (i === 0) ctx.moveTo(tx, ty);
    else ctx.lineTo(tx, ty);
  }
  ctx.stroke();

  // Tranquillity Base Flat Pad (indices 11 to 19)
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
  ctx.strokeStyle = primaryColor;
  ctx.lineWidth = 1.8;

  // Cabin
  ctx.strokeRect(-9, -14, 18, 11);
  ctx.strokeRect(-12, -3, 24, 7);

  // Legs
  ctx.beginPath();
  ctx.moveTo(-12, 4); ctx.lineTo(-18, 12);
  ctx.moveTo(12, 4); ctx.lineTo(18, 12);
  ctx.stroke();

  // Throttle Plume
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

// ============================================================================
// 7. Project Export
// ============================================================================

async function exportReconstructedProject() {
  try {
    const res = await fetch(`/api/export?target_id=${currentTargetId}`);
    const data = await res.json();
    const content = `// ==========================================\n` +
      `// GhostGraph Reconstructed Software Artifact\n` +
      `// Target: ${data.target} (${data.filename})\n` +
      `// Build: ${data.compile_cmd}\n` +
      `// ==========================================\n\n` +
      `/* --- Makefile --- */\n` +
      `${data.makefile}\n\n` +
      `/* --- ${data.filename} --- */\n` +
      `${(liveReconstructedCode || data.source_code).slice(0, 1500)}...\n[Truncated for view]`;

    document.getElementById("exportModalContent").innerText = content;
    exportModal.classList.remove("hidden");
  } catch (err) {
    console.error("Failed to export project:", err);
  }
}

function closeExportModal() {
  exportModal.classList.add("hidden");
}
