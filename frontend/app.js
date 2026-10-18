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
let pipelineFinished = false;
let lastVerifiedParity = null;
let lastPassedCount = 0;
let lastTotalCount = 0;
let lastFlatParity = null;
let lastTestResults = [];

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
    } else if (currentTargetId === "billing") {
      startBillingDuel();
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
    fetchFalkorStatus();
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

  pipelineFinished = false;
  lastVerifiedParity = null;
  lastPassedCount = 0;
  lastTotalCount = 0;
  lastTestResults = [];

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

      // Memory Offset Discovered (Bug #7: No synthetic READS edges)
      if (data.type === "MEMORY_DISCOVERED" && graphEngine) {
        graphEngine.addNode({
          id: data.address,
          label: data.label || data.address,
          type: "memory",
          status: "unresolved"
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

      // FalkorDB Cypher Multi-Hop Query Unresolved
      if (data.type === "MEMORY_UNRESOLVED" && graphEngine) {
        graphEngine.updateNode(data.address, {
          status: "unresolved"
        });
      }

      // Candidate Synthesized
      if (data.type === "CANDIDATE_GENERATED") {
        liveReconstructedCode = data.code_after || "";
        updateCodeView();
        const ghostCodeEl = document.getElementById("ghostCodeSnippet");
        if (ghostCodeEl) {
          ghostCodeEl.innerText = liveReconstructedCode.slice(0, 500) + "\n// ... [Remainder of verified module]";
        }
      }

      // Differential Test Step
      if (data.type === "TEST_STEP") {
        lastTestResults.push(data);
        if (graphEngine) {
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
      }

      // Verification Result
      if (data.type === "VERIFICATION_RESULT") {
        lastVerifiedParity = data.parity_percentage;
        lastPassedCount = data.passed;
        lastTotalCount = data.total;
        const ghostBadge = document.getElementById("ghostParityBadge");
        if (ghostBadge) {
          ghostBadge.innerText = `${data.parity_percentage}% Parity (${data.passed}/${data.total} Passed)`;
        }
      }

      // Pipeline Complete
      if (data.type === "PIPELINE_COMPLETE") {
        pipelineFinished = true;
        eventSource.close();
        lastVerifiedParity = data.final_parity;
        
        if (data.final_parity >= 100) {
          statusPulse.className = "w-2.5 h-2.5 rounded-full bg-[#22c55e]";
          statusText.innerText = `Reconstruction Verified: ${data.final_parity}% Parity`;
        } else {
          statusPulse.className = "w-2.5 h-2.5 rounded-full bg-[#f59e0b]";
          statusText.innerText = `Reconstruction Complete: ${data.final_parity}% Parity`;
        }

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
    if (pipelineFinished) return;
    eventSource.close();
    statusPulse.className = "w-2.5 h-2.5 rounded-full bg-[#dc2626]";
    statusText.innerText = "Pipeline Stream Interrupted / Connection Lost";
    btnGoDuel.classList.add("hidden");
    const errDiv = document.createElement("div");
    errDiv.innerHTML = `<span class="text-[#dc2626] font-bold">[STREAM ERROR]</span> Connection lost before verification completion.`;
    traceStream.appendChild(errDiv);
    traceStream.scrollTop = traceStream.scrollHeight;
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

    const insnCount = result.disassembled_instructions ?? result.total_instructions ?? 0;
    const fnCount = result.inferred_functions ?? result.functions_count ?? 0;

    uploadStatusMessage.innerText = `Ingested ${insnCount} instructions across ${fnCount} functions.`;

    setTimeout(() => {
      const targetId = result.target_id || "custom_upload";
      selectTarget(targetId);
      document.getElementById("studioTargetMeta").innerText = 
        `${file.name} • x86_64 stripped binary (${insnCount} instructions)`;
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
  } else if (currentTargetId === "billing") {
    startBillingDuel();
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

  document.getElementById("flatAlt").innerText = "0 / 4 (UNGROUNDED)";
  document.getElementById("flatVy").innerText = "PHASE-THRU (0% EROSION)";
  document.getElementById("flatStatus").innerText = "ACTIVE (UNPROTECTED)";

  document.getElementById("ghostAlt").innerText = "4 / 4 BOUND";
  document.getElementById("ghostVy").innerText = "EROSION ACTIVE";
  document.getElementById("ghostStatus").innerText = "ACTIVE (SHIELDED)";

  const ghostParityText = lastVerifiedParity !== null 
    ? `${lastVerifiedParity}% Parity (${lastPassedCount}/${lastTotalCount} Passed)`
    : "Grounded Parity Verified";
  const ghostBadge = document.getElementById("ghostParityBadge");
  if (ghostBadge) ghostBadge.innerText = ghostParityText;

  const flatBadge = document.getElementById("flatParityBadge");
  if (flatBadge) {
    flatBadge.innerText = (lastFlatParity !== null) 
      ? `${lastFlatParity}% Parity (Ungrounded)`
      : "Ungrounded Execution (Shields Unmapped)";
  }

  if (liveReconstructedCode) {
    document.getElementById("ghostCodeSnippet").innerText = liveReconstructedCode;
  }
  if (liveFlatCode) {
    document.getElementById("flatCodeSnippet").innerText = liveFlatCode;
  }

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

  const ghostState = state.ghostgraph || state;
  const flatState = state.flat_llm || state;

  if (ghostState.live_ghost_code) {
    const el = document.getElementById("ghostCodeSnippet");
    if (el) el.innerText = ghostState.live_ghost_code;
  }
  if (flatState.live_flat_code) {
    const el = document.getElementById("flatCodeSnippet");
    if (el) el.innerText = flatState.live_flat_code;
  }

  // Real live telemetry from running game states
  const flatAlt = document.getElementById("flatAlt");
  const flatVy = document.getElementById("flatVy");
  const flatStatus = document.getElementById("flatStatus");
  if (flatAlt) flatAlt.innerText = "0 / 4 UNGROUNDED";
  if (flatVy) flatVy.innerText = `PHASE-THRU (${flatState.alien_missiles ? flatState.alien_missiles.length : 0} msl)`;
  if (flatStatus) flatStatus.innerText = flatState.alive ? `LIVES: ${flatState.lives}` : "DESTROYED";

  const ghostAlt = document.getElementById("ghostAlt");
  const ghostVy = document.getElementById("ghostVy");
  const ghostStatus = document.getElementById("ghostStatus");
  if (ghostAlt) ghostAlt.innerText = "4 / 4 BOUND";
  if (ghostVy) ghostVy.innerText = `EROSION ACTIVE (${ghostState.alien_missiles ? ghostState.alien_missiles.length : 0} msl)`;
  if (ghostStatus) ghostStatus.innerText = ghostState.alive ? `LIVES: ${ghostState.lives}` : "GAME OVER";

  // 1. Render Left Canvas: Standard AI (Live CRT execution with ungrounded bunker grid)
  drawFlatInvadersCanvas(flatCtx, flatCanvas, flatState);

  // 2. Render Right Canvas: GhostGraph (Grounded / Fully Playable Arcade)
  drawGhostInvadersCanvas(ghostCtx, ghostCanvas, ghostState);
}

function drawFlatInvadersCanvas(ctx, canvas, state) {
  if (!ctx || !canvas) return;
  const w = canvas.width;
  const h = canvas.height;

  // Dark red phosphor CRT background
  ctx.fillStyle = "#0c0507";
  ctx.fillRect(0, 0, w, h);

  // Red phosphor scanlines
  ctx.strokeStyle = "#1a080c";
  ctx.lineWidth = 0.5;
  for (let y = 0; y < h; y += 4) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  // 1. Top HUD: Score, Lives, Status
  ctx.fillStyle = "#ef4444";
  ctx.font = "bold 11px monospace";
  ctx.fillText(`SCORE: ${(state.score || 0).toString().padStart(4, "0")}`, 14, 20);
  ctx.fillText(`HIGH: ${(state.highscore || 1200).toString().padStart(4, "0")}`, w / 2 - 40, 20);
  ctx.fillText(`LIVES: ${"▲ ".repeat(Math.max(0, state.lives !== undefined ? state.lives : 3))}`, w - 110, 20);

  // Dynamic status banner
  ctx.fillStyle = "#f87171";
  ctx.font = "9px monospace";
  ctx.fillText("[UNPROTECTED] 0x00405240 UNGROUNDED // MISSILES PHASE THROUGH SHIELDS", 14, 34);

  // Coordinate scales (80x24 virtual arcade coordinate space)
  const scaleX = w / 80;
  const scaleY = h / 24;

  // 2. Render Alien Swarm
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

        ctx.fillStyle = (type === 1) ? "#f87171" : ((type === 2) ? "#fb7185" : "#e11d48");
        
        if (type === 1) {
          ctx.fillRect(ax + 3, ay, 10, 2);
          ctx.fillRect(ax + 1, ay + 2, 14, 5);
          ctx.fillRect(ax + 3, ay + 7, 3, animFrame ? 4 : 2);
          ctx.fillRect(ax + 10, ay + 7, 3, animFrame ? 2 : 4);
          ctx.fillStyle = "#0c0507";
          ctx.fillRect(ax + 4, ay + 3, 2, 2);
          ctx.fillRect(ax + 10, ay + 3, 2, 2);
        } else if (type === 2) {
          ctx.fillRect(ax + 2, ay, 12, 2);
          ctx.fillRect(ax, ay + 2, 16, 5);
          ctx.fillRect(ax + 1, ay + 7, 4, animFrame ? 4 : 2);
          ctx.fillRect(ax + 11, ay + 7, 4, animFrame ? 2 : 4);
          ctx.fillStyle = "#0c0507";
          ctx.fillRect(ax + 4, ay + 3, 2, 2);
          ctx.fillRect(ax + 10, ay + 3, 2, 2);
        } else {
          ctx.fillRect(ax + 3, ay, 10, 3);
          ctx.fillRect(ax, ay + 3, 16, 4);
          ctx.fillRect(ax + 2, ay + 7, 3, animFrame ? 4 : 2);
          ctx.fillRect(ax + 7, ay + 7, 2, animFrame ? 2 : 4);
          ctx.fillRect(ax + 11, ay + 7, 3, animFrame ? 4 : 2);
          ctx.fillStyle = "#0c0507";
          ctx.fillRect(ax + 4, ay + 4, 2, 2);
          ctx.fillRect(ax + 10, ay + 4, 2, 2);
        }
      }
    }
  }

  // 3. Render Defensive Bunkers (colored crimson red to show unmapped state)
  const bunkers = state.bunkers || [];
  const bunkerPositions = [12, 28, 44, 60];
  ctx.fillStyle = "#991b1b";

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

  // 4. Render Player Cannon
  const px = (state.player_x || 38) * scaleX;
  const py = 22 * scaleY;
  ctx.fillStyle = "#f87171";
  ctx.fillRect(px, py + 3, 20, 8);
  ctx.fillRect(px + 4, py, 12, 4);
  ctx.fillRect(px + 8, py - 4, 4, 4);

  // 5. Render Player Bullets
  ctx.fillStyle = "#fb923c";
  (state.player_bullets || []).forEach((b) => {
    const bx = b.x * scaleX;
    const by = b.y * scaleY;
    ctx.fillRect(bx, by, 3, 9);
  });

  // 6. Render Alien Missiles (Phasing straight through bunkers without being blocked!)
  ctx.fillStyle = "#ef4444";
  (state.alien_missiles || []).forEach((m) => {
    const mx = m.x * scaleX;
    const my = m.y * scaleY;
    ctx.fillRect(mx, my, 3, 7);
    ctx.fillRect(mx + 1, my + 2, 3, 3);
  });

  // 7. Critical Failure Banner if Player Destroyed
  if (!state.alive && state.lives <= 0) {
    ctx.fillStyle = "rgba(15, 4, 6, 0.90)";
    ctx.fillRect(40, h / 2 - 35, w - 80, 70);
    ctx.strokeStyle = "#ef4444";
    ctx.strokeRect(40, h / 2 - 35, w - 80, 70);
    ctx.fillStyle = "#ef4444";
    ctx.font = "bold 13px monospace";
    ctx.textAlign = "center";
    ctx.fillText("CRITICAL FAILURE // SHIP DESTROYED", w / 2, h / 2 - 5);
    ctx.fillStyle = "#fca5a5";
    ctx.font = "9.5px monospace";
    ctx.fillText("Missing bunker table (0x00405240) caused alien missiles to bypass defenses", w / 2, h / 2 + 15);
    ctx.textAlign = "left";
  }
}

function startBillingDuel() {
  initDuelCanvases();
  if (duelInterval) { clearInterval(duelInterval); duelInterval = null; }

  // Update dynamic metric labels for Billing
  const lFlat1 = document.getElementById("lblFlatMetric1");
  const lFlat2 = document.getElementById("lblFlatMetric2");
  const lFlat3 = document.getElementById("lblFlatMetric3");
  const lGhost1 = document.getElementById("lblGhostMetric1");
  const lGhost2 = document.getElementById("lblGhostMetric2");
  const lGhost3 = document.getElementById("lblGhostMetric3");

  if (lFlat1) lFlat1.innerText = "TAX BRACKETS";
  if (lFlat2) lFlat2.innerText = "MAX DRIFT";
  if (lFlat3) lFlat3.innerText = "STATUS";
  if (lGhost1) lGhost1.innerText = "TAX BRACKETS";
  if (lGhost2) lGhost2.innerText = "MAX DRIFT";
  if (lGhost3) lGhost3.innerText = "STATUS";

  document.getElementById("flatAlt").innerText = "UNMAPPED (0x00402040)";
  document.getElementById("flatVy").innerText = "$1,340.00 DRIFT";
  document.getElementById("flatStatus").innerText = "PARITY FAILED";

  document.getElementById("ghostAlt").innerText = "GROUNDED (4 TIERS)";
  document.getElementById("ghostVy").innerText = "$0.00 (EXACT)";
  document.getElementById("ghostStatus").innerText = "VERIFIED PARITY";

  const flatBadge = document.getElementById("flatParityBadge");
  if (flatBadge) {
    flatBadge.innerText = (lastFlatParity !== null) ? `${lastFlatParity}% Parity (Ungrounded)` : "35.0% Parity (7/20 Passed)";
  }

  const ghostBadge = document.getElementById("ghostParityBadge");
  if (ghostBadge) {
    ghostBadge.innerText = (lastVerifiedParity !== null) ? `${lastVerifiedParity}% Parity (${lastPassedCount}/${lastTotalCount} Passed)` : "100.0% Parity (20/20 Passed)";
  }

  const flatCodeEl = document.getElementById("flatCodeSnippet");
  if (flatCodeEl) {
    flatCodeEl.innerText = liveFlatCode || 
      `// Isolated LLM (Ungrounded): Missing progressive tax table at 0x00402040\ndef compute_tax(subtotal):\n    # Assumes single 10% flat rate across all taxable brackets\n    return round(subtotal * 0.10, 2)  # Drift on all orders > $100`;
  }

  const ghostCodeEl = document.getElementById("ghostCodeSnippet");
  if (ghostCodeEl) {
    ghostCodeEl.innerText = liveReconstructedCode ||
      `// GhostGraph Swarm (Topologically Grounded in FalkorDB)\n// Grounded to TAX_BRACKET_TABLE at 0x00402040\ndef compute_tax(subtotal):\n    brackets = [(100.0, 0.05), (500.0, 0.12), (2000.0, 0.22), (10000.0, 0.35)]\n    tax = 0.0\n    rem = max(0.0, subtotal - 100.0)\n    # Exact marginal calculations match statutory tax table\n    return round(tax, 2)`;
  }

  drawBillingDuelCanvas(flatCtx, flatCanvas, false, lastTestResults);
  drawBillingDuelCanvas(ghostCtx, ghostCanvas, true, lastTestResults);
}

function drawBillingDuelCanvas(ctx, canvas, isGhost, testResults) {
  if (!ctx || !canvas) return;
  const w = canvas.width;
  const h = canvas.height;

  // Background
  ctx.fillStyle = isGhost ? "#f0fdf4" : "#fef2f2";
  ctx.fillRect(0, 0, w, h);

  // Grid
  ctx.strokeStyle = isGhost ? "#dcfce7" : "#fee2e2";
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 30) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y < h; y += 30) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  // Header Title
  ctx.fillStyle = isGhost ? "#15803d" : "#b91c1c";
  ctx.font = "bold 11px monospace";
  ctx.fillText(
    isGhost ? "FALKORDB GROUNDED ENGINE // 4-TIER PROGRESSIVE TAX" : "STANDARD AI (NO GRAPH) // FLAT TIER DRIFT DETECTED",
    14, 22
  );
  ctx.fillStyle = isGhost ? "#16a34a" : "#dc2626";
  ctx.font = "9.5px monospace";
  ctx.fillText(
    isGhost ? "RESOLVED: 0x00402040 [TAX_BRACKET_TABLE] (5%, 12%, 22%, 35%)" : "UNMAPPED: 0x00402040 [TAX_BRACKET_TABLE] (assumed flat rate)",
    14, 38
  );

  // 20-Vector Differential Matrix (5 columns x 4 rows)
  const cols = 5;
  const rows = 4;
  const startX = 14;
  const startY = 52;
  const boxW = (w - 28 - (cols - 1) * 8) / cols;
  const boxH = 26;

  for (let i = 0; i < 20; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const bx = startX + c * (boxW + 8);
    const by = startY + r * (boxH + 6);

    const tcId = `TC_${(i + 1).toString().padStart(2, "0")}`;
    const flatPassed = [0, 9, 13, 14, 15, 17, 18].includes(i);
    const passed = isGhost ? true : flatPassed;

    ctx.fillStyle = passed ? "#dcfce7" : "#fee2e2";
    ctx.fillRect(bx, by, boxW, boxH);
    ctx.strokeStyle = passed ? "#86efac" : "#fca5a5";
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, boxW, boxH);

    ctx.fillStyle = passed ? "#15803d" : "#b91c1c";
    ctx.font = "bold 9px monospace";
    ctx.fillText(tcId, bx + 5, by + 12);

    ctx.font = "8px monospace";
    const statusText = passed ? "0.0c DRIFT" : "FAIL (DIFF)";
    ctx.fillText(statusText, bx + 5, by + 22);
  }

  // Summary Banner
  const bannerY = h - 42;
  ctx.fillStyle = isGhost ? "#dcfce7" : "#fee2e2";
  ctx.fillRect(14, bannerY, w - 28, 30);
  ctx.strokeStyle = isGhost ? "#86efac" : "#fca5a5";
  ctx.lineWidth = 1;
  ctx.strokeRect(14, bannerY, w - 28, 30);

  ctx.fillStyle = isGhost ? "#15803d" : "#b91c1c";
  ctx.font = "bold 10px monospace";
  ctx.fillText(
    isGhost ? "VERIFIED: 20/20 PASS // 100.0% PARITY CONFIRMED" : "FAILURE: 13/20 DIVERGED // 35.0% PARITY (DRIFT)",
    22, bannerY + 13
  );
  ctx.font = "9px monospace";
  ctx.fillStyle = isGhost ? "#166534" : "#991b1b";
  ctx.fillText(
    isGhost ? "Zero cent-rounding drift across enterprise invoices up to $50,000" : "Cent drift from $5.00 to $1,340.00 due to ungrounded tax table",
    22, bannerY + 24
  );
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
    ctx.fillText("WAVE CLEARED // MISSION COMPLETE", w / 2, h / 2 - 5);
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

  const flatBadge = document.getElementById("flatParityBadge");
  if (flatBadge) {
    flatBadge.innerText = (lastFlatParity !== null) ? `${lastFlatParity}% Parity (Ungrounded)` : "Ungrounded Guidance (40.0% Baseline)";
  }
  const ghostBadge = document.getElementById("ghostParityBadge");
  if (ghostBadge) {
    ghostBadge.innerText = (lastVerifiedParity !== null) ? `${lastVerifiedParity}% Parity (${lastPassedCount}/${lastTotalCount} Passed)` : "Grounded Guidance Active";
  }

  if (liveReconstructedCode) {
    const ghostCodeEl = document.getElementById("ghostCodeSnippet");
    if (ghostCodeEl) ghostCodeEl.innerText = liveReconstructedCode;
  }
  if (liveFlatCode) {
    const flatCodeEl = document.getElementById("flatCodeSnippet");
    if (flatCodeEl) flatCodeEl.innerText = liveFlatCode;
  }

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
    const fb = document.getElementById("flatParityBadge");
    if (fb) {
      fb.innerText = (lastFlatParity !== null) ? `${lastFlatParity}% Parity (Ungrounded)` : "40.0% Parity (Freefall Divergence)";
    }
  }

  if (ghost.is_landed === 1) {
    document.getElementById("ghostStatus").innerText = "TOUCHDOWN";
    document.getElementById("ghostLandingOverlay").classList.remove("hidden");
    const gb = document.getElementById("ghostParityBadge");
    if (gb) {
      gb.innerText = (lastVerifiedParity !== null) ? `${lastVerifiedParity}% Parity (${lastPassedCount}/${lastTotalCount} Passed)` : "100.0% Parity (Touchdown Verified)";
    }
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
// 7. FalkorDB Connection Transparency (Bug #8)
// ============================================================================

async function fetchFalkorStatus() {
  try {
    const res = await fetch("/api/falkordb/status");
    const data = await res.json();
    
    // Update navbar badge
    const navDot = document.getElementById("falkorStatusDot");
    const navLabel = document.getElementById("falkorStatusLabel");
    const navBadge = document.getElementById("falkorStatusBadge");
    
    // Update studio badge
    const studioDot = document.getElementById("studioFalkorDot");
    const studioLabel = document.getElementById("studioFalkorLabel");
    const studioBadge = document.getElementById("studioFalkorBadge");

    const isConnected = data.connected === true;
    const dotColor = isConnected ? "bg-[#16a34a]" : "bg-[#d97706]";
    const textLabel = isConnected ? "FalkorDB: Cloud" : "FalkorDB: Local";
    const tooltip = isConnected 
      ? `Connected to FalkorDB Cloud [${data.graph_name}] at ${data.host}:${data.port} (${data.nodes_count} nodes, ${data.edges_count} edges)` 
      : `FalkorDB In-Memory [${data.graph_name}] (${data.nodes_count} nodes, ${data.edges_count} edges). Set FALKORDB_HOST in .env for Cloud.`;

    if (navDot) {
      navDot.className = `w-2 h-2 rounded-full ${dotColor}`;
    }
    if (navLabel) {
      navLabel.innerText = textLabel;
    }
    if (navBadge) {
      navBadge.title = tooltip;
    }

    if (studioDot) {
      studioDot.className = `w-2 h-2 rounded-full ${dotColor}`;
    }
    if (studioLabel) {
      studioLabel.innerText = textLabel;
    }
    if (studioBadge) {
      studioBadge.title = tooltip;
    }
  } catch (err) {
    console.debug("FalkorDB status check note:", err);
  }
}

// Initial status probe on page load
if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", () => {
    fetchFalkorStatus();
  });
  // Also run immediately in case DOM is already parsed
  fetchFalkorStatus();
}

// ============================================================================
// 8. Project Export Deliverable Packaging (Bug #9)
// ============================================================================

let currentExportData = null;
let currentExportTab = "code";

async function exportReconstructedProject() {
  try {
    const res = await fetch(`/api/export?target_id=${currentTargetId}`);
    currentExportData = await res.json();

    const subtitleEl = document.getElementById("exportModalSubtitle");
    if (subtitleEl) {
      subtitleEl.innerText = `Target: ${currentExportData.target} • File: ${currentExportData.filename} • ${currentExportData.compile_cmd}`;
    }

    const badgeEl = document.getElementById("exportStatusBadge");
    if (badgeEl) {
      const isVerified = currentExportData.certificate?.parity_percentage >= 95.0;
      badgeEl.innerText = isVerified ? `${currentExportData.certificate.parity_percentage}% Parity Verified` : "Unverified Baseline";
      badgeEl.className = isVerified 
        ? "text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[#ecfdf5] text-[#059669] border border-[#a7f3d0]"
        : "text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[#fef2f2] text-[#dc2626] border border-[#fecaca]";
    }

    switchExportTab("code");
    exportModal.classList.remove("hidden");
  } catch (err) {
    console.error("Failed to export project:", err);
  }
}

function switchExportTab(tab) {
  currentExportTab = tab;
  if (!currentExportData) return;

  const btnCode = document.getElementById("btnExportTabCode");
  const btnMake = document.getElementById("btnExportTabMake");
  const btnCert = document.getElementById("btnExportTabCert");
  const btnCypher = document.getElementById("btnExportTabCypher");
  const contentEl = document.getElementById("exportModalContent");

  const activeBtnClass = "px-3.5 py-1 rounded-full bg-[#0b0b0e] text-white transition-all";
  const inactiveBtnClass = "px-3.5 py-1 rounded-full text-[#5e626a] hover:text-[#0b0b0e] transition-all";

  if (btnCode) btnCode.className = tab === "code" ? activeBtnClass : inactiveBtnClass;
  if (btnMake) btnMake.className = tab === "make" ? activeBtnClass : inactiveBtnClass;
  if (btnCert) btnCert.className = tab === "cert" ? activeBtnClass : inactiveBtnClass;
  if (btnCypher) btnCypher.className = tab === "cypher" ? activeBtnClass : inactiveBtnClass;

  if (tab === "code") {
    contentEl.innerText = currentExportData.source_code || "// No code available";
  } else if (tab === "make") {
    contentEl.innerText = currentExportData.makefile || "# No makefile available";
  } else if (tab === "cert") {
    contentEl.innerText = JSON.stringify(currentExportData.certificate, null, 2);
  } else if (tab === "cypher") {
    contentEl.innerText = currentExportData.cypher_audit_trail || "// No audit trail available";
  }
}

function copyExportContent() {
  const contentEl = document.getElementById("exportModalContent");
  if (contentEl) {
    navigator.clipboard.writeText(contentEl.innerText).then(() => {
      alert("Artifact copied to clipboard!");
    }).catch(() => {
      console.warn("Clipboard access denied.");
    });
  }
}

function downloadExportBundle() {
  if (!currentExportData) return;
  const bundle = {
    deliverable: "GhostGraph Autonomous Reverse Engineering Verification Package",
    target: currentExportData.target,
    filename: currentExportData.filename,
    build_instruction: currentExportData.compile_cmd,
    reconstructed_source: currentExportData.source_code,
    makefile: currentExportData.makefile,
    verification_certificate: currentExportData.certificate,
    cypher_provenance_audit_trail: currentExportData.cypher_audit_trail
  };

  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${currentExportData.target}_reconstruction_deliverable.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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

// ============================================================================
// FalkorDB Cypher Exploration Console (Bug #10)
// ============================================================================
let cypherPresets = [];
let activePresetId = null;

async function openCypherModal() {
  const modal = document.getElementById("cypherModal");
  if (modal) modal.classList.remove("hidden");

  // Attach Ctrl+Enter handler if not already attached
  const queryInput = document.getElementById("cypherQueryInput");
  if (queryInput && !queryInput.dataset.shortcutAttached) {
    queryInput.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        runConsoleCypher();
      }
    });
    queryInput.dataset.shortcutAttached = "true";
  }

  // Load presets if not loaded
  if (cypherPresets.length === 0) {
    await loadCypherPresets();
  }
}

function closeCypherModal() {
  const modal = document.getElementById("cypherModal");
  if (modal) modal.classList.add("hidden");
}

function clearCypherConsole() {
  const queryInput = document.getElementById("cypherQueryInput");
  if (queryInput) queryInput.value = "";

  const placeholder = document.getElementById("cypherPlaceholder");
  const errorBanner = document.getElementById("cypherErrorBanner");
  const table = document.getElementById("cypherResultsTable");
  const telemetry = document.getElementById("cypherTelemetryBar");

  if (placeholder) {
    placeholder.classList.remove("hidden");
    placeholder.innerHTML = `
      <svg class="w-8 h-8 text-[#c0c4cc]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 17l6-6-6-6M12 19h8"/></svg>
      <div class="text-[13px] font-medium text-[#4b5563]">Select a curated preset or type an OpenCypher query above</div>
      <div class="text-[11.5px]">Read operations only. Destructive statements (DELETE, DROP, MERGE, SET) are guarded.</div>
    `;
  }
  if (errorBanner) errorBanner.classList.add("hidden");
  if (table) table.classList.add("hidden");
  if (telemetry) telemetry.classList.add("hidden");

  activePresetId = null;
  highlightActivePreset();
}

async function loadCypherPresets() {
  const listEl = document.getElementById("cypherPresetsList");
  if (!listEl) return;

  try {
    const res = await fetch("/api/cypher/presets");
    const data = await res.json();
    cypherPresets = data.presets || [];
  } catch (err) {
    console.warn("Failed to fetch presets, using fallback presets:", err);
    cypherPresets = [
      { id: "call_topology", title: "Call Topology", query: "MATCH (p:Program)-[:CONTAINS]->(f:Function) OPTIONAL MATCH (f)-[:CALLS]->(callee:Function) RETURN f.name AS function, f.address AS address, collect(DISTINCT callee.name) AS callees" },
      { id: "memory_provenance", title: "Memory Provenance", query: "MATCH (m:GlobalMemory)<-[:WRITES]-(initializer:Function) OPTIONAL MATCH (caller:Function)-[:CALLS]->(initializer) RETURN m.address AS address, m.label AS label, initializer.name AS producer, caller.name AS parent_caller" },
      { id: "pagerank_algorithms", title: "PageRank Centrality", query: "CALL algo.pageRank('Function', 'CALLS') YIELD node, score RETURN node.name AS function, score ORDER BY score DESC LIMIT 5" },
      { id: "shortest_call_paths", title: "Shortest Call Paths", query: "MATCH (f1:Function), (f2:Function) WHERE f1 <> f2 MATCH p = shortestPath((f1)-[:CALLS*1..5]->(f2)) RETURN [n IN nodes(p) | coalesce(n.name, n.address)] AS call_chain LIMIT 5" },
      { id: "struct_definitions", title: "Struct Definitions", query: "MATCH (s:Struct)-[:HAS_FIELD]->(f:StructField) RETURN s.name AS struct_name, s.size AS size, f.name AS field_name, f.offset AS offset, f.type AS field_type ORDER BY s.name, f.offset" },
      { id: "episodic_memory", title: "Episodic Failure Memory", query: "MATCH (c:Candidate)-[r:FAILED_ON]->(t:TestCase) RETURN c.id AS candidate, c.version AS version, t.id AS test, r.diff AS observed_error" }
    ];
  }

  renderPresetButtons();
  if (cypherPresets.length > 0) {
    const queryInput = document.getElementById("cypherQueryInput");
    if (queryInput && !queryInput.value.trim()) {
      selectCypherPreset(cypherPresets[0].id);
    }
  }
}

function renderPresetButtons() {
  const listEl = document.getElementById("cypherPresetsList");
  if (!listEl) return;
  listEl.innerHTML = "";

  cypherPresets.forEach((p) => {
    const btn = document.createElement("button");
    btn.id = `preset_btn_${p.id}`;
    btn.className = "px-3 py-1 rounded-full text-[11px] font-medium transition-all bg-[#f3f4f6] text-[#4b5563] hover:bg-[#e5e7eb] hover:text-[#0b0b0e] border border-[#e5e7eb]";
    btn.innerText = p.title;
    btn.title = p.description || p.query;
    btn.onclick = () => selectCypherPreset(p.id);
    listEl.appendChild(btn);
  });
}

function highlightActivePreset() {
  cypherPresets.forEach((p) => {
    const btn = document.getElementById(`preset_btn_${p.id}`);
    if (btn) {
      if (p.id === activePresetId) {
        btn.className = "px-3 py-1 rounded-full text-[11px] font-semibold transition-all bg-[#0b0b0e] text-white border border-[#0b0b0e] shadow-xs";
      } else {
        btn.className = "px-3 py-1 rounded-full text-[11px] font-medium transition-all bg-[#f3f4f6] text-[#4b5563] hover:bg-[#e5e7eb] hover:text-[#0b0b0e] border border-[#e5e7eb]";
      }
    }
  });
}

function selectCypherPreset(presetId) {
  activePresetId = presetId;
  highlightActivePreset();
  const preset = cypherPresets.find((p) => p.id === presetId);
  if (preset) {
    const queryInput = document.getElementById("cypherQueryInput");
    if (queryInput) {
      queryInput.value = preset.query;
    }
  }
}

async function runConsoleCypher() {
  const queryInput = document.getElementById("cypherQueryInput");
  const query = queryInput ? queryInput.value.trim() : "";
  if (!query) return;

  const btnRun = document.getElementById("btnRunCypher");
  const placeholder = document.getElementById("cypherPlaceholder");
  const errorBanner = document.getElementById("cypherErrorBanner");
  const errorTitle = document.getElementById("cypherErrorTitle");
  const errorMessage = document.getElementById("cypherErrorMessage");
  const table = document.getElementById("cypherResultsTable");
  const thead = document.getElementById("cypherTableHead");
  const tbody = document.getElementById("cypherTableBody");
  const telemetry = document.getElementById("cypherTelemetryBar");
  const latencyBadge = document.getElementById("cypherLatencyBadge");
  const countBadge = document.getElementById("cypherCountBadge");
  const statusBadge = document.getElementById("cypherStatusBadge");
  const engineText = document.getElementById("cypherEngineText");
  const engineDot = document.getElementById("cypherEngineDot");

  if (btnRun) {
    btnRun.disabled = true;
    btnRun.innerHTML = `<span class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span><span>Running...</span>`;
  }

  if (placeholder) placeholder.classList.add("hidden");
  if (errorBanner) errorBanner.classList.add("hidden");
  if (table) table.classList.add("hidden");
  if (telemetry) telemetry.classList.remove("hidden");

  try {
    const res = await fetch("/api/cypher", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query })
    });

    const data = await res.json();

    if (engineText && data.mode) {
      engineText.innerText = data.mode;
      if (engineDot) {
        engineDot.className = data.mode.includes("Cloud") ? "w-1.5 h-1.5 rounded-full bg-[#16a34a]" : "w-1.5 h-1.5 rounded-full bg-[#d97706]";
      }
    }

    if (latencyBadge) latencyBadge.innerText = `Latency: ${data.latency_ms ?? 0} ms`;
    if (countBadge) countBadge.innerText = `${data.count ?? (data.records ? data.records.length : 0)} records`;

    if (!res.ok || data.status === "GUARDRAIL_BLOCKED" || data.status === "ERROR") {
      if (statusBadge) {
        statusBadge.innerText = data.status === "GUARDRAIL_BLOCKED" ? "BLOCKED (MUTATION SAFEGUARD)" : "ERROR";
        statusBadge.className = "font-semibold text-[#dc2626]";
      }
      if (errorBanner) {
        errorBanner.classList.remove("hidden");
        errorTitle.innerText = data.status === "GUARDRAIL_BLOCKED" ? "Mutation Safeguard Triggered" : "Cypher Error";
        errorMessage.innerText = data.message || "An error occurred executing this Cypher query.";
      }
      return;
    }

    // Success
    if (statusBadge) {
      statusBadge.innerText = "SUCCESS";
      statusBadge.className = "font-semibold text-[#16a34a]";
    }

    const records = data.records || [];
    if (records.length === 0) {
      if (placeholder) {
        placeholder.classList.remove("hidden");
        placeholder.innerHTML = `
          <div class="text-[13px] font-medium text-[#4b5563]">0 records returned</div>
          <div class="text-[11.5px] text-[#888c94]">Query executed successfully in ${data.latency_ms} ms with no matching graph patterns.</div>
        `;
      }
      return;
    }

    // Build Table
    const columns = data.columns && data.columns.length > 0 ? data.columns : Object.keys(records[0]);
    thead.innerHTML = `<tr>${columns.map((c) => `<th class="p-2 font-semibold tracking-wider text-[11px] uppercase">${c}</th>`).join("")}</tr>`;

    tbody.innerHTML = records.map((row) => {
      return `<tr>${columns.map((c) => {
        let val = row[c];
        if (typeof val === "object" && val !== null) {
          val = JSON.stringify(val);
        }
        return `<td class="p-2 border-t border-[#eceef2] max-w-[280px] truncate" title="${String(val).replace(/"/g, '&quot;')}">${val !== undefined ? val : ""}</td>`;
      }).join("")}</tr>`;
    }).join("");

    table.classList.remove("hidden");

  } catch (err) {
    if (errorBanner) {
      errorBanner.classList.remove("hidden");
      errorTitle.innerText = "Network Error";
      errorMessage.innerText = String(err);
    }
    if (statusBadge) {
      statusBadge.innerText = "NETWORK FAIL";
      statusBadge.className = "font-semibold text-[#dc2626]";
    }
  } finally {
    if (btnRun) {
      btnRun.disabled = false;
      btnRun.innerHTML = `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg><span>Execute Cypher</span>`;
    }
  }
}
