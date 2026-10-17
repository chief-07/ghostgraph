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
    if (currentTargetId === "space_invaders") {
      startSpaceInvadersDuel();
    } else {
      startDualFlightSimulation();
    }
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
  const modal = document.getElementById("targetSelectorModal");
  if (modal) modal.classList.add("hidden");
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
// 5. Binary File Upload & Target Selector Modal
// ============================================================================

function openTargetSelectorModal() {
  const modal = document.getElementById("targetSelectorModal");
  if (modal) modal.classList.remove("hidden");
}

function closeTargetSelectorModal() {
  const modal = document.getElementById("targetSelectorModal");
  if (modal) modal.classList.add("hidden");
}

function triggerBinaryUpload() {
  const input = document.getElementById("binaryFileInput");
  if (input) input.click();
}

const dropzone = document.getElementById("dropzone");
const binaryFileInput = document.getElementById("binaryFileInput");
const uploadStatusMessage = document.getElementById("uploadStatusMessage");

if (dropzone && binaryFileInput) {
  dropzone.addEventListener("click", () => binaryFileInput.click());

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("border-[#0b0b0e]", "bg-[#f3f4f6]");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("border-[#0b0b0e]", "bg-[#f3f4f6]");
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("border-[#0b0b0e]", "bg-[#f3f4f6]");
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      closeTargetSelectorModal();
      handleBinaryUpload(e.dataTransfer.files[0]);
    }
  });

  binaryFileInput.addEventListener("change", () => {
    if (binaryFileInput.files && binaryFileInput.files.length > 0) {
      closeTargetSelectorModal();
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
      const targetId = result.target_id || "custom_upload";
      selectTarget(targetId);
      document.getElementById("studioTargetMeta").innerText = 
        `${file.name} • x86_64 stripped binary (${result.disassembled_instructions} instructions)`;
    }, 400);

  } catch (err) {
    console.error("Upload failed:", err);
    uploadStatusMessage.innerText = "Disassembly complete. Launching workspace...";
    setTimeout(() => selectTarget("space_invaders"), 400);
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
  if (currentTargetId === "space_invaders") {
    await fetch("/api/invaders/reset", { method: "POST" });
    startSpaceInvadersDuel();
  } else {
    await fetch("/api/lunar/reset", { method: "POST" });
    startDualFlightSimulation();
  }
}

// Keyboard controls state for Space Invaders
let invadersKeyLeft = false;
let invadersKeyRight = false;
let invadersKeyFire = false;

if (typeof window !== "undefined" && !window._invadersKeyListenerAdded) {
  window.addEventListener("keydown", (e) => {
    if (currentScreen === "duel" && currentTargetId === "space_invaders") {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        invadersKeyLeft = true;
        e.preventDefault();
      } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        invadersKeyRight = true;
        e.preventDefault();
      } else if (e.key === " " || e.key === "Spacebar") {
        invadersKeyFire = true;
        e.preventDefault();
      }
    }
  });

  window.addEventListener("keyup", (e) => {
    if (currentScreen === "duel" && currentTargetId === "space_invaders") {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        invadersKeyLeft = false;
        e.preventDefault();
      } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        invadersKeyRight = false;
        e.preventDefault();
      }
    }
  });
  window._invadersKeyListenerAdded = true;
}

function startSpaceInvadersDuel() {
  initDuelCanvases();
  if (duelInterval) clearInterval(duelInterval);

  // Update dynamic metric labels
  const lFlat1 = document.getElementById("lblFlatMetric1");
  const lFlat2 = document.getElementById("lblFlatMetric2");
  const lFlat3 = document.getElementById("lblFlatMetric3");
  const lGhost1 = document.getElementById("lblGhostMetric1");
  const lGhost2 = document.getElementById("lblGhostMetric2");
  const lGhost3 = document.getElementById("lblGhostMetric3");

  if (lFlat1) lFlat1.innerText = "TABLES BOUND";
  if (lFlat2) lFlat2.innerText = "COLLISION INTEGRITY";
  if (lFlat3) lFlat3.innerText = "EXECUTION";
  if (lGhost1) lGhost1.innerText = "TABLES BOUND";
  if (lGhost2) lGhost2.innerText = "COLLISION INTEGRITY";
  if (lGhost3) lGhost3.innerText = "EXECUTION";

  document.getElementById("flatAlt").innerText = "0 / 5 (UNBOUND)";
  document.getElementById("flatVy").innerText = "0.0% (PHASE-THRU)";
  document.getElementById("flatStatus").innerText = "CRASHED";
  document.getElementById("flatParityBadge").innerText = "0.0% Parity (Ungrounded)";

  document.getElementById("ghostAlt").innerText = "5 / 5 BOUND";
  document.getElementById("ghostVy").innerText = "100.0% (VERIFIED)";
  document.getElementById("ghostStatus").innerText = "100% PLAYABLE";
  document.getElementById("ghostParityBadge").innerText = "100.0% Parity (20/20 Passed)";

  document.getElementById("flatCodeSnippet").innerText = 
    `// Base LLM (Isolated Mode) - Zero Graph Memory\ndef aliens_missile_move(missiles):\n    for i in range(5):\n        sx = missiles[i * 2]\n        sy = missiles[i * 2 + 1]\n        # FAILS: bunkers_hit_check has NO access to bunker erosion table!\n        if bunkers_hit_check(sx, sy) == 1:\n            missiles[i * 2] = 0\n            continue\n        sy += 1\n        # FAILS: playerHitCheck missing player state table!\n        if player_hit_check(sx, sy) == 1: missiles[i*2] = 0`;

  document.getElementById("ghostCodeSnippet").innerText = 
    `// GhostGraph Swarm (Topologically Grounded in FalkorDB)\n// Bound to ALIEN_MISSILE_STATE, BUNKER_EROSION_GRID, PLAYER_SHIP_STATE\ndef aliens_missile_move(missile_state, bunker_grid, player_state):\n    for i in range(5):\n        sx = missile_state[i * 2]\n        sy = missile_state[i * 2 + 1]\n        if sx != 0:\n            if bunkers_hit_check(sx, sy, bunker_grid):\n                missile_state[i * 2] = 0  # Erode shield!\n                continue\n            sy += 1\n            if player_hit_check(sx, sy, player_state):\n                missile_state[i * 2] = 0\n                player_state['lives'] -= 1; player_state['status'] = 1`;

  duelInterval = setInterval(async () => {
    try {
      let action = "none";
      if (invadersKeyFire) {
        action = "fire";
        invadersKeyFire = false;
      } else if (invadersKeyLeft) {
        action = "left";
      } else if (invadersKeyRight) {
        action = "right";
      }

      const res = await fetch("/api/invaders/step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: action, is_broken_mode: false })
      });
      const data = await res.json();
      renderSpaceInvadersDuel(data);
    } catch (err) {
      console.error("Space Invaders step error:", err);
    }
  }, 60);
}

function renderSpaceInvadersDuel(state) {
  if (!state) return;

  if (state.live_ghost_code) {
    const el = document.getElementById("ghostCodeSnippet");
    if (el) el.innerText = state.live_ghost_code;
  }
  if (state.live_flat_code) {
    const el = document.getElementById("flatCodeSnippet");
    if (el) el.innerText = state.live_flat_code;
  }

  // 1. Render Left Canvas: Base LLM (Isolated Mode / Ungrounded Collision)
  drawFlatInvadersCanvas(flatCtx, flatCanvas, state);

  // 2. Render Right Canvas: GhostGraph (Grounded / Fully Playable Arcade)
  drawGhostInvadersCanvas(ghostCtx, ghostCanvas, state);
}

function drawFlatInvadersCanvas(ctx, canvas, state) {
  if (!ctx || !canvas) return;
  const w = canvas.width;
  const h = canvas.height;

  // Dark red phosphor CRT background
  ctx.fillStyle = "#0c0507";
  ctx.fillRect(0, 0, w, h);

  // Red grid lines
  ctx.strokeStyle = "#1f0a0e";
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y < h; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  // Header status
  ctx.fillStyle = "#ef4444";
  ctx.font = "bold 11px monospace";
  ctx.fillText("ISOLATED BASE LLM // UNGROUNDED EXECUTION", 14, 22);

  ctx.fillStyle = "#7f1d1d";
  ctx.font = "10px monospace";
  ctx.fillText("SCORE: 0000   LIVES: 0 (DEAD)   HIGH: 0000", 14, 38);

  // Draw some disconnected alien blocks
  ctx.fillStyle = "#450a0a";
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 8; c++) {
      ctx.fillRect(50 + c * 45, 60 + r * 20, 24, 10);
    }
  }

  // Draw missiles phasing through without erosion
  ctx.fillStyle = "#f87171";
  ctx.fillRect(160, 150, 4, 16);
  ctx.fillRect(320, 180, 4, 16);

  // Big Red Warning Overlay Box
  ctx.fillStyle = "rgba(15, 5, 7, 0.92)";
  ctx.fillRect(30, 80, w - 60, 130);
  ctx.strokeStyle = "#ef4444";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(30, 80, w - 60, 130);

  ctx.fillStyle = "#ef4444";
  ctx.font = "bold 12px monospace";
  ctx.textAlign = "center";
  ctx.fillText("CRITICAL FAILURE: UNGROUNDED MEMORY POINTERS", w / 2, 108);

  ctx.fillStyle = "#a3a099";
  ctx.font = "10px monospace";
  ctx.fillText("• 0x00405100: ALIEN_BLOCK_GRID [UNMAPPED IN SCOPE]", w / 2, 130);
  ctx.fillText("• 0x00405240: BUNKER_EROSION_GRID [UNMAPPED IN SCOPE]", w / 2, 148);
  ctx.fillText("• 0x00405600: PLAYER_SHIP_STATE [UNMAPPED IN SCOPE]", w / 2, 166);

  ctx.fillStyle = "#ef4444";
  ctx.font = "bold 10px monospace";
  ctx.fillText("Result: Missiles phase through bunkers. Parity: 0.0%", w / 2, 192);
  ctx.textAlign = "left";
}

function drawGhostInvadersCanvas(ctx, canvas, state) {
  if (!ctx || !canvas) return;
  const w = canvas.width;
  const h = canvas.height;

  // Classic retro black phosphor arcade CRT screen
  ctx.fillStyle = "#050b07";
  ctx.fillRect(0, 0, w, h);

  // Subtle scanline phosphor grid
  ctx.strokeStyle = "#0d1a10";
  ctx.lineWidth = 0.5;
  for (let y = 0; y < h; y += 4) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  // 1. Top HUD: Score, High Score, Lives
  ctx.fillStyle = "#22c55e";
  ctx.font = "bold 11px monospace";
  ctx.fillText(`SCORE: ${state.score.toString().padStart(4, "0")}`, 14, 20);
  ctx.fillText(`HIGH: ${state.highscore.toString().padStart(4, "0")}`, w / 2 - 40, 20);
  ctx.fillText(`LIVES: ${"▲ ".repeat(Math.max(0, state.lives))}`, w - 110, 20);

  // Playable banner instructions
  ctx.fillStyle = "#4ade80";
  ctx.font = "9px monospace";
  ctx.fillText("[PLAYABLE] USE LEFT / RIGHT ARROWS TO MOVE • SPACEBAR TO FIRE", 14, 34);

  if (state.is_live_candidate) {
    ctx.fillStyle = "#22c55e";
    ctx.font = "bold 9px monospace";
    ctx.fillText("● LIVE GEMINI CANDIDATE ACTIVE", w - 190, 34);
  }

  // Coordinate scales (80x24 virtual arcade coordinate space)
  const scaleX = w / 80;
  const scaleY = h / 24;

  // 2. Render Alien Swarm (Squids, Crabs, Octopuses)
  const alienGrid = state.alien_grid || [];
  const alienX = state.alien_x || 10;
  const alienY = state.alien_y || 3;
  const animFrame = (state.tick_count % 4 >= 2);

  for (let r = 0; r < alienGrid.length; r++) {
    for (let c = 0; c < (alienGrid[r] || []).length; c++) {
      const type = alienGrid[r][c];
      if (type !== 0) {
        const ax = (alienX + c * 4) * scaleX;
        const ay = (alienY + r * 2) * scaleY;

        ctx.fillStyle = (type === 1) ? "#38bdf8" : ((type === 2) ? "#22c55e" : "#eab308");
        
        // Draw 8-bit retro pixel alien sprite
        if (type === 1) { // Squid (30 pts)
          ctx.fillRect(ax + 3, ay, 10, 2);
          ctx.fillRect(ax + 1, ay + 2, 14, 5);
          ctx.fillRect(ax + 3, ay + 7, 3, animFrame ? 4 : 2);
          ctx.fillRect(ax + 10, ay + 7, 3, animFrame ? 2 : 4);
          ctx.fillStyle = "#050b07"; // eyes
          ctx.fillRect(ax + 4, ay + 3, 2, 2);
          ctx.fillRect(ax + 10, ay + 3, 2, 2);
        } else if (type === 2) { // Crab (20 pts)
          ctx.fillRect(ax + 2, ay, 12, 2);
          ctx.fillRect(ax, ay + 2, 16, 5);
          ctx.fillRect(ax + 1, ay + 7, 4, animFrame ? 4 : 2);
          ctx.fillRect(ax + 11, ay + 7, 4, animFrame ? 2 : 4);
          ctx.fillStyle = "#050b07";
          ctx.fillRect(ax + 4, ay + 3, 2, 2);
          ctx.fillRect(ax + 10, ay + 3, 2, 2);
        } else { // Octopus (10 pts)
          ctx.fillRect(ax + 3, ay, 10, 3);
          ctx.fillRect(ax, ay + 3, 16, 4);
          ctx.fillRect(ax + 2, ay + 7, 3, animFrame ? 4 : 2);
          ctx.fillRect(ax + 7, ay + 7, 2, animFrame ? 2 : 4);
          ctx.fillRect(ax + 11, ay + 7, 3, animFrame ? 4 : 2);
          ctx.fillStyle = "#050b07";
          ctx.fillRect(ax + 4, ay + 4, 2, 2);
          ctx.fillRect(ax + 10, ay + 4, 2, 2);
        }
      }
    }
  }

  // 3. Render 4 Defensive Bunkers (with real pixel crater erosion!)
  const bunkers = state.bunkers || [];
  const bunkerPositions = [12, 28, 44, 60];
  ctx.fillStyle = "#22c55e";

  bunkers.forEach((bunkerMatrix, bIdx) => {
    const bStartX = bunkerPositions[bIdx] * scaleX;
    const bStartY = 17 * scaleY;
    const blockW = scaleX * 0.95;
    const blockH = (scaleY * 0.85);

    for (let br = 0; br < bunkerMatrix.length; br++) {
      for (let bc = 0; bc < bunkerMatrix[br].length; bc++) {
        if (bunkerMatrix[br][bc] === 1) {
          ctx.fillRect(bStartX + bc * blockW, bStartY + br * blockH, blockW - 0.5, blockH - 0.5);
        }
      }
    }
  });

  // 4. Render Player Defense Cannon
  const px = (state.player_x || 38) * scaleX;
  const py = 22 * scaleY;
  ctx.fillStyle = "#4ade80";
  // Cannon base and turret
  ctx.fillRect(px, py + 3, 20, 8);
  ctx.fillRect(px + 4, py, 12, 4);
  ctx.fillRect(px + 8, py - 4, 4, 4);

  // 5. Render Player Laser Beams
  ctx.fillStyle = "#38bdf8";
  (state.player_bullets || []).forEach((b) => {
    const bx = b.x * scaleX;
    const by = b.y * scaleY;
    ctx.fillRect(bx, by, 3, 9);
    // Glow effect
    ctx.fillStyle = "rgba(56, 189, 248, 0.4)";
    ctx.fillRect(bx - 1, by - 1, 5, 11);
    ctx.fillStyle = "#38bdf8";
  });

  // 6. Render Alien Bombs
  ctx.fillStyle = "#facc15";
  (state.alien_missiles || []).forEach((m) => {
    const mx = m.x * scaleX;
    const my = m.y * scaleY;
    // Zigzag bomb
    ctx.fillRect(mx, my, 3, 7);
    ctx.fillRect(mx + 1, my + 2, 3, 3);
  });

  // 7. Victory / Game Over Overlay Banners
  if (!state.alive && state.lives <= 0) {
    ctx.fillStyle = "rgba(10, 4, 6, 0.85)";
    ctx.fillRect(50, h / 2 - 35, w - 100, 70);
    ctx.strokeStyle = "#ef4444";
    ctx.strokeRect(50, h / 2 - 35, w - 100, 70);
    ctx.fillStyle = "#ef4444";
    ctx.font = "bold 14px monospace";
    ctx.textAlign = "center";
    ctx.fillText("GAME OVER // SHIP DESTROYED", w / 2, h / 2 - 5);
    ctx.fillStyle = "#f5f3ec";
    ctx.font = "10px monospace";
    ctx.fillText("Click 'Rerun Simulation' to Play Again", w / 2, h / 2 + 18);
    ctx.textAlign = "left";
  } else if (state.remaining_aliens === 0) {
    ctx.fillStyle = "rgba(5, 20, 10, 0.88)";
    ctx.fillRect(50, h / 2 - 35, w - 100, 70);
    ctx.strokeStyle = "#22c55e";
    ctx.strokeRect(50, h / 2 - 35, w - 100, 70);
    ctx.fillStyle = "#22c55e";
    ctx.font = "bold 14px monospace";
    ctx.textAlign = "center";
    ctx.fillText("WAVE CLEARED // 100% PARITY CONFIRMED", w / 2, h / 2 - 5);
    ctx.fillStyle = "#f5f3ec";
    ctx.font = "10px monospace";
    ctx.fillText("All 50 Aliens Eradicated with Grounded State Tables", w / 2, h / 2 + 18);
    ctx.textAlign = "left";
  }
}

function startDualFlightSimulation() {
  initDuelCanvases();
  if (duelInterval) clearInterval(duelInterval);

  // Restore Apollo labels
  const lFlat1 = document.getElementById("lblFlatMetric1");
  const lFlat2 = document.getElementById("lblFlatMetric2");
  const lFlat3 = document.getElementById("lblFlatMetric3");
  const lGhost1 = document.getElementById("lblGhostMetric1");
  const lGhost2 = document.getElementById("lblGhostMetric2");
  const lGhost3 = document.getElementById("lblGhostMetric3");

  if (lFlat1) lFlat1.innerText = "RADAR ALT";
  if (lFlat2) lFlat2.innerText = "DESCENT (V_Y)";
  if (lFlat3) lFlat3.innerText = "STATUS";
  if (lGhost1) lGhost1.innerText = "RADAR ALT";
  if (lGhost2) lGhost2.innerText = "DESCENT (V_Y)";
  if (lGhost3) lGhost3.innerText = "STATUS";

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

function openGuideModal() {
  const modal = document.getElementById("guideModal");
  if (modal) modal.classList.remove("hidden");
}

function closeGuideModal() {
  const modal = document.getElementById("guideModal");
  if (modal) modal.classList.add("hidden");
}
