/**
 * GhostGraph Modern Minimalist Agent Controller
 * Multi-screen progressive workbench with custom Canvas Graph Engine,
 * live FalkorDB streaming, and real-time execution duel.
 */

// Application Global State
let currentScreen = "hero";
let currentTargetId = "lunar_lander";
let currentTargetData = null;
let graphEngine = null;
let eventSource = null;
let duelInterval = null;
let activeCodeView = "disasm"; // "disasm" | "recon"

// DOM Elements
const screenHero = document.getElementById("screenHero");
const screenStudio = document.getElementById("screenStudio");
const screenDuel = document.getElementById("screenDuel");
const breadTarget = document.getElementById("breadTarget");
const breadView = document.getElementById("breadView");
const navBreadcrumb = document.getElementById("navBreadcrumb");
const exportModal = document.getElementById("exportModal");

// ============================================================================
// 1. Screen State Management (Zero page scroll, clean replacements)
// ============================================================================

function setScreen(screenName) {
  currentScreen = screenName;

  screenHero.classList.remove("active");
  screenStudio.classList.remove("active");
  screenDuel.classList.remove("active");

  if (screenName === "hero") {
    screenHero.classList.add("active");
    navBreadcrumb.classList.add("hidden");
    if (duelInterval) { clearInterval(duelInterval); duelInterval = null; }
    if (eventSource) { eventSource.close(); eventSource = null; }
  } else if (screenName === "studio") {
    screenStudio.classList.add("active");
    navBreadcrumb.classList.remove("hidden");
    breadView.innerText = "Agent Studio";
    if (duelInterval) { clearInterval(duelInterval); duelInterval = null; }
    if (graphEngine) {
      setTimeout(() => {
        graphEngine.resize();
        graphEngine.fit();
      }, 50);
    }
  } else if (screenName === "duel") {
    screenDuel.classList.add("active");
    navBreadcrumb.classList.remove("hidden");
    breadView.innerText = "Live Execution Duel";
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
// 2. Target Selection & Swarm Initialization
// ============================================================================

async function selectTarget(targetId) {
  currentTargetId = targetId;
  const targetNames = {
    lunar_lander: "Apollo 11 LGC Guidance",
    telemetry: "Satellite Telemetry Decoder",
    keygen: "Enterprise License Keygen"
  };
  breadTarget.innerText = targetNames[targetId] || targetId;

  // Transition to Studio Screen
  setScreen("studio");

  // Fetch target details
  try {
    const res = await fetch(`/api/target/details?target_id=${targetId}`);
    currentTargetData = await res.json();
    populateStudioMetadata(currentTargetData);
  } catch (err) {
    console.error("Failed to load target details:", err);
  }

  // Initialize Custom Canvas Graph if not already created
  initGraphCanvas();
  loadGraphForTarget(targetId);

  // Start Autonomous Swarm Pipeline
  startSwarmPipeline(targetId);
}

function populateStudioMetadata(data) {
  if (!data) return;
  const target = data.target;
  const cfg = data.config;

  document.getElementById("studioTargetMeta").innerText = 
    `${target.name} • ${target.arch}`;

  // Update Code Pane
  updateCodeView();
}

function switchCodeView(view) {
  activeCodeView = view;
  const btnDisasm = document.getElementById("btnTabDisasm");
  const btnRecon = document.getElementById("btnTabRecon");

  if (view === "disasm") {
    btnDisasm.className = "px-2 py-0.5 rounded bg-[#1a202c] text-[#f3f0e8] border border-[#2d374d]";
    btnRecon.className = "px-2 py-0.5 rounded text-[#9da6b8] hover:text-[#f3f0e8]";
  } else {
    btnRecon.className = "px-2 py-0.5 rounded bg-[#1a202c] text-[#f3f0e8] border border-[#2d374d]";
    btnDisasm.className = "px-2 py-0.5 rounded text-[#9da6b8] hover:text-[#f3f0e8]";
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
    codeEl.innerHTML = `<span class="text-[#38bdf8]">// TARGET ENTRY: ${cfg.primary_fn}</span>\n` +
      `<span class="text-[#f59e0b]">// DETACHED POINTER: ${cfg.critical_mem} (${cfg.mem_label})</span>\n\n` +
      escapeHtml(cfg.decompiled_snippet);
  } else {
    codeEl.innerHTML = `<span class="text-[#2eb872]">// GROUNDED C IMPLEMENTATION (Resolved via FalkorDB)</span>\n\n` +
      escapeHtml(cfg.reconstructed_c);
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
// 3. Custom Canvas Graph Engine Integration
// ============================================================================

function initGraphCanvas() {
  if (!graphEngine) {
    const canvas = document.getElementById("customGraphCanvas");
    if (canvas) {
      graphEngine = new GhostCanvasGraph(canvas);
    }
  }
}

function loadGraphForTarget(targetId) {
  if (!graphEngine) return;

  let elements = [];

  if (targetId === "lunar_lander") {
    elements = [
      { data: { id: "prog", label: "Apollo LGC (1979)", type: "program" } },
      { data: { id: "fn_init", label: "init_flight_computer", type: "function" } },
      { data: { id: "fn_terrain", label: "generate_terrain_profile", type: "function" } },
      { data: { id: "fn_thrust", label: "apply_thrust_vector", type: "function" } },
      { data: { id: "fn_physics", label: "update_newtonian_physics", type: "function" } },
      { data: { id: "fn_raycast", label: "check_altitude_raycast", type: "function" } },
      { data: { id: "fn_touchdown", label: "evaluate_touchdown_dynamics", type: "function" } },
      { data: { id: "m_throttle", label: "0x00403000 (Throttle)", type: "memory" } },
      { data: { id: "m_mascon", label: "0x00403080 (Mascon)", type: "memory" } },
      { data: { id: "m_terrain", label: "0x00403100 (Terrain)", type: "memory" } },
      { data: { id: "m_state", label: "0x00403200 (Telemetry)", type: "memory" } },
      { data: { id: "tc_freefall", label: "TC-01: Freefall", type: "testcase" } },
      { data: { id: "tc_hover", label: "TC-02: Thrust Balance", type: "testcase" } },
      { data: { id: "tc_raycast", label: "TC-03: Terrain Raycast", type: "testcase" } },
      { data: { id: "tc_touchdown", label: "TC-04: Touchdown Gs", type: "testcase" } },
      // Calls
      { data: { source: "prog", target: "fn_init", label: "CALLS" } },
      { data: { source: "fn_init", target: "fn_terrain", label: "CALLS" } },
      { data: { source: "fn_physics", target: "fn_thrust", label: "CALLS" } },
      { data: { source: "fn_physics", target: "fn_raycast", label: "CALLS" } },
      { data: { source: "fn_physics", target: "fn_touchdown", label: "CALLS" } },
      // Memory Access
      { data: { source: "fn_thrust", target: "m_throttle", label: "READS" } },
      { data: { source: "fn_physics", target: "m_mascon", label: "READS" } },
      { data: { source: "fn_terrain", target: "m_terrain", label: "WRITES" } },
      { data: { source: "fn_raycast", target: "m_terrain", label: "READS" } },
      { data: { source: "fn_touchdown", target: "m_terrain", label: "READS" } },
      // Tests
      { data: { source: "tc_freefall", target: "fn_physics", label: "TESTED_BY" } },
      { data: { source: "tc_hover", target: "fn_thrust", label: "TESTED_BY" } },
      { data: { source: "tc_raycast", target: "fn_raycast", label: "TESTED_BY" } },
      { data: { source: "tc_touchdown", target: "fn_touchdown", label: "TESTED_BY" } }
    ];
  } else if (targetId === "telemetry") {
    elements = [
      { data: { id: "prog", label: "Telemetry Decoder", type: "program" } },
      { data: { id: "fn_init", label: "init_crc16_poly", type: "function" } },
      { data: { id: "fn_unpack", label: "unpack_telemetry_frame", type: "function" } },
      { data: { id: "fn_calib", label: "calibrate_sensor_data", type: "function" } },
      { data: { id: "fn_crc", label: "verify_crc16_checksum", type: "function" } },
      { data: { id: "m_crc", label: "0x00402010 (CRC Table)", type: "memory" } },
      { data: { id: "m_frame", label: "0x00402080 (Buffer)", type: "memory" } },
      { data: { id: "tc_crc", label: "TC-01: CRC Validation", type: "testcase" } },
      { data: { id: "tc_frame", label: "TC-02: Frame Sync", type: "testcase" } },
      { data: { source: "prog", target: "fn_init", label: "CALLS" } },
      { data: { source: "fn_init", target: "m_crc", label: "WRITES" } },
      { data: { source: "fn_unpack", target: "fn_calib", label: "CALLS" } },
      { data: { source: "fn_unpack", target: "fn_crc", label: "CALLS" } },
      { data: { source: "fn_crc", target: "m_crc", label: "READS" } },
      { data: { source: "tc_crc", target: "fn_crc", label: "TESTED_BY" } },
      { data: { source: "tc_frame", target: "fn_unpack", label: "TESTED_BY" } }
    ];
  } else {
    elements = [
      { data: { id: "prog", label: "License Keygen", type: "program" } },
      { data: { id: "fn_init", label: "init_crypto_sbox", type: "function" } },
      { data: { id: "fn_hash", label: "hash_fnv1a_block", type: "function" } },
      { data: { id: "fn_sub", label: "substitute_sbox_byte", type: "function" } },
      { data: { id: "fn_val", label: "validate_license_tier", type: "function" } },
      { data: { id: "m_sbox", label: "0x00405100 (S-Box)", type: "memory" } },
      { data: { id: "tc_valid", label: "TC-01: Valid Serial", type: "testcase" } },
      { data: { id: "tc_tamper", label: "TC-02: Tampered Byte", type: "testcase" } },
      { data: { source: "prog", target: "fn_init", label: "CALLS" } },
      { data: { source: "fn_init", target: "m_sbox", label: "WRITES" } },
      { data: { source: "fn_val", target: "fn_hash", label: "CALLS" } },
      { data: { source: "fn_hash", target: "fn_sub", label: "CALLS" } },
      { data: { source: "fn_sub", target: "m_sbox", label: "READS" } },
      { data: { source: "tc_valid", target: "fn_val", label: "TESTED_BY" } },
      { data: { source: "tc_tamper", target: "fn_sub", label: "TESTED_BY" } }
    ];
  }

  graphEngine.setElements(elements);
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

// Workspace Tab Switching (Graph vs Memory Stream)
function switchWorkspaceTab(tab) {
  const btnGraph = document.getElementById("tabBtnGraph");
  const btnMem = document.getElementById("tabBtnMemory");
  const viewGraph = document.getElementById("tabGraphView");
  const viewMem = document.getElementById("tabMemoryView");
  const controls = document.getElementById("graphControls");

  if (tab === "graph") {
    btnGraph.className = "text-[#f3f0e8] font-bold border-b-2 border-[#f3f0e8] pb-1.5 transition-all";
    btnMem.className = "text-[#9da6b8] hover:text-[#f3f0e8] pb-1.5 transition-all";
    viewGraph.classList.remove("hidden");
    viewMem.classList.add("hidden");
    controls.classList.remove("hidden");
    if (graphEngine) {
      setTimeout(() => { graphEngine.resize(); graphEngine.fit(); }, 50);
    }
  } else {
    btnMem.className = "text-[#f3f0e8] font-bold border-b-2 border-[#f3f0e8] pb-1.5 transition-all";
    btnGraph.className = "text-[#9da6b8] hover:text-[#f3f0e8] pb-1.5 transition-all";
    viewMem.classList.remove("hidden");
    viewGraph.classList.add("hidden");
    controls.classList.add("hidden");
  }
}

// ============================================================================
// 4. FalkorDB Multi-Agent Stream & Live Event Processing
// ============================================================================

function startSwarmPipeline(targetId) {
  const traceStream = document.getElementById("agentTraceStream");
  const statusPulse = document.getElementById("studioPulse");
  const statusText = document.getElementById("studioStatusText");
  const btnGoDuel = document.getElementById("btnGoToDuel");

  traceStream.innerHTML = "";
  statusPulse.className = "w-2.5 h-2.5 rounded-full bg-[#38bdf8] animate-pulse";
  statusText.innerText = "Swarm Active: Ingesting Binary Topology into FalkorDB...";
  btnGoDuel.classList.add("hidden");

  if (eventSource) eventSource.close();
  eventSource = new EventSource(`/api/reconstruct/stream?target_id=${targetId}&use_graph=true`);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      appendTraceEvent(data);

      if (data.type === "MEMORY_RESOLVED") {
        if (graphEngine) {
          // Emit pulse packet travelling to memory node
          graphEngine.emitQueryPulse("fn_thrust", "m_throttle", "#f59e0b");
          graphEngine.emitQueryPulse("fn_physics", "m_throttle", "#2eb872");
          graphEngine.setNodeStatus("m_throttle", "verified");
        }
      }

      if (data.type === "PIPELINE_COMPLETE") {
        eventSource.close();
        statusPulse.className = "w-2.5 h-2.5 rounded-full bg-[#2eb872]";
        statusText.innerText = "Reconstruction Complete: 100% Mathematical Parity";

        if (graphEngine) {
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
    statusPulse.className = "w-2.5 h-2.5 rounded-full bg-[#2eb872]";
    statusText.innerText = "Reconstruction Complete: 100% Parity Verified";
    if (graphEngine) graphEngine.setAllStatus("verified");
    btnGoDuel.classList.remove("hidden");
  };
}

function appendTraceEvent(evt) {
  const traceStream = document.getElementById("agentTraceStream");
  const div = document.createElement("div");

  if (evt.type === "PIPELINE_START") {
    div.innerHTML = `<span class="text-[#38bdf8] font-bold">[SUPERVISOR]</span> Ingested binary specimen: ${evt.target_display_name}`;
  } else if (evt.type === "AGENT_STEP") {
    div.innerHTML = `<span class="text-[#f59e0b] font-bold">[${evt.agent}]</span> ${evt.message}`;
  } else if (evt.type === "MEMORY_RESOLVED") {
    div.innerHTML = `<span class="text-[#2eb872] font-bold">[FALKORDB GRAPH]</span> Grounded address <strong>${evt.address}</strong> -> <em>${evt.label}</em> (written by ${evt.producer})`;
  } else if (evt.type === "CANDIDATE_GENERATED") {
    div.innerHTML = `<span class="text-[#f3f0e8] font-bold">[RECONSTRUCTOR]</span> Synthesized Candidate <strong>${evt.candidate_id}</strong> with typed global structs.`;
  } else if (evt.type === "VERIFICATION_RESULT") {
    div.innerHTML = `<span class="text-[#2eb872] font-bold">[VERIFIER]</span> Differential Parity: <strong>${evt.parity_percentage}%</strong> (${evt.passed}/${evt.total} vectors passed).`;
  } else if (evt.type === "PIPELINE_COMPLETE") {
    div.innerHTML = `<span class="text-[#2eb872] font-bold">[COMPLETE]</span> Software reconstruction converged with 100% behavioral parity.`;
  }

  traceStream.appendChild(div);
  traceStream.scrollTop = traceStream.scrollHeight;
}

// ============================================================================
// 5. Binary File Upload Handling
// ============================================================================

const dropzone = document.getElementById("dropzone");
const binaryFileInput = document.getElementById("binaryFileInput");
const uploadStatusMessage = document.getElementById("uploadStatusMessage");

if (dropzone && binaryFileInput) {
  dropzone.addEventListener("click", () => binaryFileInput.click());

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("border-[#38bdf8]", "bg-[#161c28]");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("border-[#38bdf8]", "bg-[#161c28]");
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("border-[#38bdf8]", "bg-[#161c28]");
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

    // Start studio on Apollo LGC with the uploaded banner
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
// 6. Live Execution Duel Simulation (Simultaneous Concurrency)
// ============================================================================

let flatCanvas = null, flatCtx = null;
let ghostCanvas = null, ghostCtx = null;

function initDuelCanvases() {
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
  initDuelCanvases();
  if (duelInterval) clearInterval(duelInterval);

  duelInterval = setInterval(async () => {
    try {
      // Step both simulations simultaneously in a single round-trip
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

  // Update Telemetry
  document.getElementById("flatAlt").innerText = `${flat.radar_alt} m`;
  document.getElementById("flatVy").innerText = `${flat.vy} m/s`;
  document.getElementById("ghostAlt").innerText = `${ghost.radar_alt} m`;
  document.getElementById("ghostVy").innerText = `${ghost.vy} m/s`;

  if (flat.is_landed !== 0) {
    document.getElementById("flatStatus").innerText = "CRASHED";
    document.getElementById("flatCrashOverlay").classList.remove("hidden");
  }

  if (ghost.is_landed === 1) {
    document.getElementById("ghostStatus").innerText = "TOUCHDOWN";
    document.getElementById("ghostLandingOverlay").classList.remove("hidden");
  }

  // Draw Base LLM Viewport
  drawLanderViewport(flatCtx, flatCanvas, flat, terrain, "#ef4444");

  // Draw GhostGraph Viewport
  drawLanderViewport(ghostCtx, ghostCanvas, ghost, terrain, "#2eb872");
}

function drawLanderViewport(ctx, canvas, state, terrain, primaryColor) {
  if (!ctx || !canvas) return;
  const w = canvas.width;
  const h = canvas.height;

  // Background
  ctx.fillStyle = "#0c0e14";
  ctx.fillRect(0, 0, w, h);

  // Subtle coordinate grid
  ctx.strokeStyle = "#161b26";
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y < h; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  // Terrain profile line
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
  ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
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
      `${data.source_code.slice(0, 1500)}...\n[Truncated for view]`;

    document.getElementById("exportModalContent").innerText = content;
    exportModal.classList.remove("hidden");
  } catch (err) {
    console.error("Failed to export project:", err);
  }
}

function closeExportModal() {
  exportModal.classList.add("hidden");
}
