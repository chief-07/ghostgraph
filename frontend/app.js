// GhostGraph Autonomous Reverse Engineering Platform Frontend Engine
let cy = null;
let currentTarget = "telemetry";
let currentTargetData = null;
let eventSource = null;
let isPlaying = false;
let pacmanInterval = null;

// Pac-Man Game State for arcade benchmark
let gameState = {
  px: 14, py: 26, pdir: 1,
  bx: 14, by: 11, bdir: 1,
  score: 120,
  mode: "CHASE",
  is_broken_mode: false
};

// Initialize on DOM Load
document.addEventListener("DOMContentLoaded", async () => {
  initCytoscape();
  initPacmanCanvas();
  await switchTarget("telemetry");
});

// ----------------------------------------------------------------------------
// Target Switching & Loading
// ----------------------------------------------------------------------------
async function switchTarget(targetId) {
  currentTarget = targetId;

  // Update target selector button states
  document.querySelectorAll(".target-tab").forEach(tab => {
    if (tab.dataset.target === targetId) {
      tab.className = "target-tab active text-xs font-mono px-3 py-1.5 rounded-md bg-purple-600/30 text-purple-200 border border-purple-500/50 flex items-center gap-1.5 transition-all";
    } else {
      tab.className = "target-tab text-xs font-mono px-3 py-1.5 rounded-md text-slate-400 hover:text-white border border-transparent transition-all";
    }
  });

  // Fetch target specification & test vectors
  try {
    const res = await fetch(`/api/target/details?target_id=${targetId}`);
    currentTargetData = await res.json();
    renderTargetDetails(currentTargetData);
  } catch (err) {
    console.warn("Failed to load target details:", err);
  }

  // Ingest to FalkorDB & load graph topology
  await ingestCurrentTarget();
  await loadGraphData();

  // Reset parity state to clean standby
  resetParityUI();
  updateRuntimeSubView(targetId);
}

function renderTargetDetails(data) {
  const t = data.target;
  const cfg = data.config;

  document.getElementById("targetBadge").innerText = t.badge || "BENCHMARK";
  document.getElementById("targetTitle").innerText = t.name;
  document.getElementById("targetDescription").innerHTML = t.description;
  document.getElementById("targetArch").innerText = t.arch;
  document.getElementById("targetSymbol").innerText = t.critical_symbol;
  document.getElementById("targetVectorsCount").innerText = `${data.test_vectors.length} Vectors`;

  // Update decompiled code preview in Stage 1
  document.getElementById("decompiledSnippetCode").innerHTML = `<code class="language-c">${escapeHtml(cfg.decompiled_snippet)}</code>`;

  // Update Code Diff tab Before/After
  document.getElementById("codeDiffBefore").innerText = cfg.decompiled_snippet;
  document.getElementById("codeDiffAfter").innerText = cfg.reconstructed_c;
  document.getElementById("diffResolutionNotice").innerText = `Ground truth memory: ${cfg.mem_label} initialized in ${cfg.producer_fn}`;

  // Update episodic memory target label
  document.getElementById("memTargetLabel").innerText = t.name;

  // Render initial test vectors grid in neutral state
  renderTestVectorGrid(data.test_vectors, "PENDING");
}

function updateRuntimeSubView(targetId) {
  const viewTel = document.getElementById("runtimeViewTelemetry");
  const viewPac = document.getElementById("runtimeViewPacman");
  const viewKey = document.getElementById("runtimeViewKeygen");
  const lblMode = document.getElementById("runtimeModeNotice");

  viewTel.classList.add("hidden");
  viewPac.classList.add("hidden");
  viewKey.classList.add("hidden");

  if (targetId === "telemetry") {
    viewTel.classList.remove("hidden");
    lblMode.innerText = "Satellite Downlink Stream Telemetry";
    fetchTelemetryDownlink(true);
  } else if (targetId === "pacman") {
    viewPac.classList.remove("hidden");
    lblMode.innerText = "Deterministic State Machine & Maze Engine";
    renderPacmanCanvas();
  } else if (targetId === "keygen") {
    viewKey.classList.remove("hidden");
    lblMode.innerText = "License Checksum & S-Box Validator";
  }
}

// ----------------------------------------------------------------------------
// Stage Navigation & Tabs
// ----------------------------------------------------------------------------
function switchTab(tabId) {
  const tabs = ["graph", "multiagent", "diff", "runtime"];
  tabs.forEach(t => {
    const pane = document.getElementById(`tabContent${capitalize(t)}`);
    if (pane) {
      if (t === tabId) {
        pane.classList.remove("hidden");
      } else {
        pane.classList.add("hidden");
      }
    }
  });

  // Update nav-tab styles
  const buttons = document.querySelectorAll(".nav-tab");
  buttons.forEach(btn => {
    if (btn.getAttribute("onclick") && btn.getAttribute("onclick").includes(tabId)) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  if (tabId === "graph" && cy) {
    setTimeout(() => cy.resize(), 100);
  }
}

// ----------------------------------------------------------------------------
// FalkorDB Ingestion & Cytoscape Knowledge Graph
// ----------------------------------------------------------------------------
async function ingestCurrentTarget() {
  logTerminal("TopologyAgent", `Ingesting target '${currentTarget}' AST and cross-references into FalkorDB...`, "text-purple-300");
  const formData = new FormData();
  formData.append("target_id", currentTarget);

  try {
    const res = await fetch("/api/ingest", { method: "POST", body: formData });
    const data = await res.json();
    logTerminal("FalkorDB", `Graph Schema Ingested: ${data.functions_count} functions, ${data.memory_nodes_count} memory buffers, ${data.test_cases_count} test cases.`, "text-emerald-400 font-bold");
  } catch (err) {
    logTerminal("Error", `Ingestion failure: ${err.message}`, "text-red-400");
  }
}

function initCytoscape() {
  cy = cytoscape({
    container: document.getElementById("cy"),
    style: [
      {
        selector: "node",
        style: {
          "label": "data(label)",
          "color": "#E2E8F0",
          "font-size": "10px",
          "font-family": "monospace",
          "text-valign": "bottom",
          "text-margin-y": "5px",
          "background-color": "#7C3AED",
          "width": "26px",
          "height": "26px",
          "border-width": "2px",
          "border-color": "#4C1D95",
          "transition-property": "background-color, border-color, width, height",
          "transition-duration": "0.3s"
        }
      },
      {
        selector: 'node[group = "GlobalMemory"]',
        style: {
          "background-color": "#F59E0B",
          "border-color": "#78350F",
          "shape": "diamond",
          "width": "28px",
          "height": "28px"
        }
      },
      {
        selector: 'node[group = "TestCase"]',
        style: {
          "background-color": "#10B981",
          "border-color": "#064E3B",
          "shape": "round-rectangle",
          "width": "22px",
          "height": "16px",
          "font-size": "8px"
        }
      },
      {
        selector: 'node[group = "Candidate"]',
        style: {
          "background-color": "#EC4899",
          "border-color": "#831843",
          "shape": "hexagon",
          "width": "26px",
          "height": "26px"
        }
      },
      {
        selector: "edge",
        style: {
          "width": 1.5,
          "line-color": "#334155",
          "target-arrow-color": "#334155",
          "target-arrow-shape": "triangle",
          "curve-style": "bezier",
          "label": "data(label)",
          "font-size": "8px",
          "color": "#64748B",
          "text-rotation": "autorotate"
        }
      },
      {
        selector: 'edge[label = "READS"], edge[label = "WRITES"]',
        style: {
          "line-color": "#F59E0B",
          "target-arrow-color": "#F59E0B",
          "line-style": "dashed",
          "width": 2
        }
      },
      {
        selector: 'edge[label = "FAILED_ON"]',
        style: {
          "line-color": "#EF4444",
          "target-arrow-color": "#EF4444",
          "width": 3,
          "line-style": "dotted"
        }
      },
      // Dynamic Glowing Pulse Classes
      {
        selector: ".node-pulsing",
        style: {
          "border-color": "#A78BFA",
          "border-width": "5px",
          "width": "34px",
          "height": "34px",
          "shadow-blur": "15px",
          "shadow-color": "#8B5CF6"
        }
      },
      {
        selector: ".node-active-memory",
        style: {
          "background-color": "#FCD34D",
          "border-color": "#F59E0B",
          "border-width": "5px",
          "width": "36px",
          "height": "36px",
          "shadow-blur": "20px",
          "shadow-color": "#F59E0B"
        }
      },
      {
        selector: ".edge-active-flow",
        style: {
          "line-color": "#A78BFA",
          "target-arrow-color": "#A78BFA",
          "width": 4
        }
      }
    ],
    elements: [],
    layout: { name: "cose", animate: false, padding: 30 }
  });

  // Click handler for node inspection drawer
  cy.on("tap", "node", (evt) => {
    const node = evt.target;
    openNodeDrawer(node.data());
  });
}

async function loadGraphData() {
  try {
    const res = await fetch("/api/graph");
    const data = await res.json();
    if (data.nodes && data.nodes.length > 0) {
      cy.elements().remove();
      cy.add(data.nodes);
      cy.add(data.edges);
      cy.layout({ name: "cose", padding: 35, animate: true, animationDuration: 600 }).run();
    }
  } catch (err) {
    console.warn("Could not load graph topology:", err);
  }
}

// ----------------------------------------------------------------------------
// Multi-Agent Pipeline Execution: Mode A (Baseline) vs Mode B (GhostGraph)
// ----------------------------------------------------------------------------

// 1. Run Baseline Mode (Vanilla LLM - No Graph) -> PROVES RULE #3
function runBaselineMode() {
  document.getElementById("swarmPipelineSection").classList.remove("hidden");
  document.getElementById("agentStatusBadge").innerText = "Executing Vanilla LLM (No Graph Context)...";
  document.getElementById("agentStatusBadge").className = "text-xs font-mono px-2.5 py-0.5 rounded bg-red-950 text-red-300 border border-red-800/60 animate-pulse";

  // Visual agent states
  setAgentStepState("cardAgentTopology", "badgeAgentTopology", "BYPASSED", "text-slate-500", "border-slate-800");
  setAgentStepState("cardAgentReconstruction", "badgeAgentReconstruction", "ISOLATED PROMPT", "text-amber-400 font-bold", "border-amber-600");
  setAgentStepState("cardAgentVerification", "badgeAgentVerification", "DIFF TESTING", "text-red-400 font-bold", "border-red-600");
  setAgentStepState("cardAgentSupervisor", "badgeAgentSupervisor", "LOGGING FAILURES", "text-slate-400", "border-slate-800");

  document.getElementById("lblActiveCypher").innerText = "NONE (Flat LLM has no graph access. Memory pointers ungrounded).";

  logTerminal("Baseline", "Initiating Vanilla LLM Reconstruction without FalkorDB graph context...", "text-red-400 font-bold");
  logTerminal("LLM", `Attempting inference on isolated function '${currentTargetData?.config?.primary_fn}'...`, "text-slate-300");
  logTerminal("Warning", `LLM has no visibility into memory address ${currentTargetData?.config?.critical_mem}. Guessing zeroed placeholder!`, "text-amber-400 font-bold");

  // Call stream endpoint with use_graph=false
  executePipelineStream(false);
}

// 2. Run GhostGraph Swarm (FalkorDB Connected Context) -> 100% PARITY
function runGhostGraphSwarm() {
  document.getElementById("swarmPipelineSection").classList.remove("hidden");
  document.getElementById("agentStatusBadge").innerText = "GhostGraph Swarm Active (FalkorDB Context)...";
  document.getElementById("agentStatusBadge").className = "text-xs font-mono px-2.5 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800/60";

  logTerminal("Supervisor", "Autonomous Swarm launched. Orchestrating multi-agent reverse engineering loop...", "text-purple-300 font-bold");

  // Switch to Knowledge Graph tab so the user sees the graph actively working!
  switchTab("graph");

  executePipelineStream(true);
}

function executePipelineStream(useGraph) {
  if (eventSource) eventSource.close();

  const url = `/api/reconstruct/stream?target_id=${currentTarget}&use_graph=${useGraph}`;
  eventSource = new EventSource(url);

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handlePipelineEvent(data, useGraph);
  };

  eventSource.onerror = () => {
    logTerminal("Stream", "Reconstruction event stream closed.", "text-slate-500");
    eventSource.close();
  };
}

function handlePipelineEvent(data, useGraph) {
  switch (data.type) {
    case "PIPELINE_START":
      logTerminal("Supervisor", data.message, "text-purple-300");
      setAgentStepState("cardAgentTopology", "badgeAgentTopology", "QUERYING", "text-purple-400 font-bold", "border-purple-600");
      break;

    case "AGENT_STEP":
      if (data.action === "QUERY_FALKORDB") {
        setAgentStepState("cardAgentTopology", "badgeAgentTopology", "VERIFIED", "text-emerald-400 font-bold", "border-emerald-600");
        setAgentStepState("cardAgentReconstruction", "badgeAgentReconstruction", "REASONING", "text-amber-400 font-bold", "border-amber-600");
        if (data.cypher) document.getElementById("lblActiveCypher").innerText = data.cypher;
      } else if (data.action === "MCP_CYPHER_REASONING") {
        setAgentStepState("cardAgentReconstruction", "badgeAgentReconstruction", "MCP CYPHER", "text-amber-400 font-bold", "border-amber-600");
        if (data.cypher) document.getElementById("lblActiveCypher").innerText = data.cypher;

        // ANIMATE CYTOSCAPE GRAPH IN REAL TIME!
        animateGraphTraversal(data.highlight_nodes || []);
      } else if (data.action === "GCC_COMPILATION") {
        setAgentStepState("cardAgentVerification", "badgeAgentVerification", "COMPILING", "text-emerald-400 font-bold", "border-emerald-600");
      } else if (data.action === "DIFFERENTIAL_EXECUTION") {
        setAgentStepState("cardAgentVerification", "badgeAgentVerification", "TESTING", "text-emerald-400 font-bold", "border-emerald-600");
      }
      logTerminal(data.agent || "Agent", `[${data.action}] ${data.message}`, "text-slate-300");
      break;

    case "MEMORY_RESOLVED":
      logTerminal("FalkorDB", data.message, "text-emerald-400 font-bold");
      document.getElementById("memResolvedCount").innerText = "1 Memory Table Resolved";
      break;

    case "CANDIDATE_GENERATED":
      logTerminal("ReconstructionAgent", `Generated candidate ${data.candidate_id}. Code committed to FalkorDB.`, "text-pink-400");
      if (data.code_after) document.getElementById("codeDiffAfter").innerText = data.code_after;
      break;

    case "VERIFICATION_RESULT":
      renderParityOutcome(data.parity_percentage, data.passed, data.total, data.results, useGraph);
      setAgentStepState("cardAgentVerification", "badgeAgentVerification", `${data.parity_percentage}% PARITY`, data.parity_percentage === 100.0 ? "text-emerald-400 font-bold" : "text-red-400 font-bold", "border-slate-700");
      setAgentStepState("cardAgentSupervisor", "badgeAgentSupervisor", "CONVERGED", "text-emerald-400 font-bold", "border-emerald-600");
      break;

    case "PIPELINE_COMPLETE":
      logTerminal("Supervisor", `Pipeline finished. Parity: ${data.final_parity}% | Mode: ${data.mode}`, data.converged ? "text-emerald-400 font-bold" : "text-red-400 font-bold");
      document.getElementById("agentStatusBadge").innerText = data.converged ? "Autonomous Convergence Achieved (100% Parity)" : "Verification Failed (Context Missing)";
      document.getElementById("agentStatusBadge").className = data.converged ? "text-xs font-mono px-2.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800" : "text-xs font-mono px-2.5 py-0.5 rounded bg-red-950 text-red-300 border border-red-800";
      break;
  }
}

// ----------------------------------------------------------------------------
// Graph Animation on Cypher Traversal
// ----------------------------------------------------------------------------
function animateGraphTraversal(nodeLabels) {
  if (!cy || !nodeLabels || nodeLabels.length === 0) return;

  // Pulse nodes matching labels
  cy.nodes().forEach(node => {
    const lbl = node.data("label") || node.data("properties")?.address || "";
    if (nodeLabels.includes(lbl) || nodeLabels.some(nl => lbl.includes(nl))) {
      node.addClass("node-pulsing");
      if (node.data("group") === "GlobalMemory") node.addClass("node-active-memory");
    } else {
      node.removeClass("node-pulsing");
      node.removeClass("node-active-memory");
    }
  });

  // Fit camera around pulsed nodes
  const matched = cy.nodes(".node-pulsing");
  if (matched.length > 0) {
    cy.animate({ fit: { eles: matched, padding: 80 }, duration: 600 });
  }
}

// ----------------------------------------------------------------------------
// Test Vector Grid & Parity Scorecard Rendering
// ----------------------------------------------------------------------------
function renderTestVectorGrid(vectors, defaultStatus = "PENDING") {
  const container = document.getElementById("testVectorGrid");
  container.innerHTML = "";

  vectors.forEach((v, idx) => {
    const badge = document.createElement("div");
    badge.id = `vecBadge_${v.id || idx}`;
    badge.className = "test-badge p-2.5 rounded border border-slate-800 bg-[#070B12] text-xs font-mono flex flex-col justify-between";
    badge.innerHTML = `
      <div class="flex items-center justify-between">
        <span class="text-slate-400 font-bold text-[11px] truncate">${v.id}</span>
        <span class="status-indicator text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-500">${defaultStatus}</span>
      </div>
      <div class="text-[10px] text-slate-400 mt-1 truncate">${v.name || v.description}</div>
    `;
    container.appendChild(badge);
  });
}

function renderParityOutcome(parity, passed, total, results, useGraph) {
  // Update metric counters
  document.getElementById("lblParityPercentage").innerText = `${parity}%`;
  document.getElementById("lblPassedCount").innerText = `${passed} / ${total}`;
  document.getElementById("lblFailedCount").innerText = `${total - passed}`;

  const globalBadge = document.getElementById("globalParityBadge");
  if (parity === 100.0) {
    globalBadge.innerText = `Parity: 100% [ ${passed}/${total} PASS ]`;
    globalBadge.className = "text-xs font-mono px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40";
  } else {
    globalBadge.innerText = `Parity: ${parity}% [ ${passed}/${total} PASS - ${total - passed} FAILED ]`;
    globalBadge.className = "text-xs font-mono px-3 py-1 rounded-full bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse";
  }

  // Update Test Vector Badges individually
  if (results && results.length > 0) {
    results.forEach((r, idx) => {
      const el = document.getElementById(`vecBadge_${r.test_id}`) || document.getElementById(`vecBadge_${idx}`);
      if (el) {
        const ind = el.querySelector(".status-indicator");
        if (r.status === "PASSED") {
          el.className = "test-badge p-2.5 rounded border border-emerald-900/60 bg-emerald-950/30 text-xs font-mono flex flex-col justify-between";
          ind.className = "status-indicator text-[10px] px-1.5 py-0.2 rounded bg-emerald-900/80 text-emerald-300 font-bold";
          ind.innerHTML = '<i class="fa-solid fa-check mr-1"></i> PASS';
        } else {
          el.className = "test-badge p-2.5 rounded border border-red-900/60 bg-red-950/30 text-xs font-mono flex flex-col justify-between";
          ind.className = "status-indicator text-[10px] px-1.5 py-0.2 rounded bg-red-900/80 text-red-300 font-bold";
          ind.innerHTML = '<i class="fa-solid fa-xmark mr-1"></i> FAIL';
        }
      }
    });
  }

  // Update target-specific runtime proof
  if (currentTarget === "telemetry") {
    fetchTelemetryDownlink(useGraph);
  } else if (currentTarget === "pacman") {
    gameState.is_broken_mode = !useGraph;
    const glitch = document.getElementById("glitchOverlay");
    if (!useGraph) {
      glitch.classList.remove("hidden");
    } else {
      glitch.classList.add("hidden");
    }
  } else if (currentTarget === "keygen") {
    const lblStatus = document.getElementById("lblKeygenStatus");
    if (useGraph) {
      lblStatus.innerText = "ENTERPRISE ACTIVATED [VALID]";
      lblStatus.className = "px-3 py-1 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-bold";
    } else {
      lblStatus.innerText = "CHECKSUM INVALID [TRIAL EXPIRED]";
      lblStatus.className = "px-3 py-1 rounded bg-red-950 text-red-400 border border-red-800 font-bold";
    }
  }
}

function resetParityUI() {
  document.getElementById("lblParityPercentage").innerText = "--%";
  document.getElementById("lblPassedCount").innerText = "0 / 0";
  document.getElementById("lblFailedCount").innerText = "0";
  document.getElementById("globalParityBadge").innerText = "Parity: Awaiting Execution";
  document.getElementById("globalParityBadge").className = "text-xs font-mono px-3 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700";
  document.getElementById("swarmPipelineSection").classList.add("hidden");
}

// ----------------------------------------------------------------------------
// Runtime Proof Consoles (Telemetry Downlink / Pacman / Keygen)
// ----------------------------------------------------------------------------
async function fetchTelemetryDownlink(isReconstructed) {
  try {
    const res = await fetch(`/api/telemetry/downlink?is_reconstructed=${isReconstructed}`);
    const data = await res.json();
    document.getElementById("lblTelemetryAlt").innerText = `${data.altitude_km} km`;
    document.getElementById("lblTelemetryVolt").innerText = `${data.bus_voltage_v} V`;
    document.getElementById("lblTelemetryTemp").innerText = `${data.solar_temp_c} °C`;
    document.getElementById("lblTelemetryHex").innerText = data.raw_frame_hex;

    const crcEl = document.getElementById("lblTelemetryCrc");
    if (data.crc_status === "VALID") {
      crcEl.innerText = `VALID [${data.computed_crc}]`;
      crcEl.className = "text-lg font-mono font-bold text-emerald-400";
    } else {
      crcEl.innerText = `CORRUPTED [${data.computed_crc}]`;
      crcEl.className = "text-lg font-mono font-bold text-red-400";
    }
  } catch (err) {
    console.warn("Failed telemetry fetch:", err);
  }
}

// Pac-Man Retro Arcade Canvas
let pacmanCanvas, pacmanCtx;
function initPacmanCanvas() {
  pacmanCanvas = document.getElementById("pacmanCanvas");
  if (pacmanCanvas) pacmanCtx = pacmanCanvas.getContext("2d");
}

function renderPacmanCanvas() {
  if (!pacmanCtx) return;
  const w = pacmanCanvas.width;
  const h = pacmanCanvas.height;
  const cell = 10;

  pacmanCtx.fillStyle = "#000000";
  pacmanCtx.fillRect(0, 0, w, h);

  pacmanCtx.strokeStyle = "#1E3A8A";
  pacmanCtx.lineWidth = 3;
  pacmanCtx.strokeRect(5, 5, w - 10, h - 10);

  // Dots
  pacmanCtx.fillStyle = "#FEF08A";
  for (let x = 3; x < 25; x += 3) {
    for (let y = 3; y < 33; y += 4) {
      pacmanCtx.beginPath();
      pacmanCtx.arc(x * cell, y * cell, 2, 0, Math.PI * 2);
      pacmanCtx.fill();
    }
  }

  // Pac-Man
  pacmanCtx.fillStyle = "#FACC15";
  pacmanCtx.beginPath();
  pacmanCtx.arc(gameState.px * cell, gameState.py * cell, 6, 0.2 * Math.PI, 1.8 * Math.PI);
  pacmanCtx.lineTo(gameState.px * cell, gameState.py * cell);
  pacmanCtx.fill();

  // Blinky
  pacmanCtx.fillStyle = "#EF4444";
  pacmanCtx.beginPath();
  pacmanCtx.arc(gameState.bx * cell, gameState.by * cell - 2, 6, Math.PI, 0);
  pacmanCtx.lineTo(gameState.bx * cell + 6, gameState.by * cell + 4);
  pacmanCtx.lineTo(gameState.bx * cell - 6, gameState.by * cell + 4);
  pacmanCtx.fill();
}

function togglePlayState() {
  // Step single frame tick
  stepPacmanFrame();
}

async function stepPacmanFrame() {
  try {
    const res = await fetch("/api/tick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(gameState)
    });
    const data = await res.json();
    gameState.px = data.pacman.x;
    gameState.py = data.pacman.y;
    gameState.bx = data.blinky.x;
    gameState.by = data.blinky.y;
    gameState.score = data.score;
    document.getElementById("lblScore").innerText = gameState.score;
    renderPacmanCanvas();
  } catch (e) {}
}

// ----------------------------------------------------------------------------
// Custom OpenCypher Console & Presets
// ----------------------------------------------------------------------------
async function runCustomCypher() {
  const query = document.getElementById("inputCypherQuery").value.trim();
  if (!query) return;

  logTerminal("CypherConsole", `Executing: ${query}`, "text-purple-300");
  try {
    const res = await fetch("/api/cypher", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query })
    });
    const data = await res.json();
    if (data.status === "SUCCESS") {
      logTerminal("FalkorDB", `Returned ${data.count} records.`, "text-emerald-400 font-bold");
      // Highlight matching nodes in Cytoscape
      const returnedNames = data.records.map(r => Object.values(r).map(v => String(v))).flat();
      animateGraphTraversal(returnedNames);
    } else {
      logTerminal("CypherError", data.message, "text-red-400");
    }
  } catch (err) {
    logTerminal("Error", err.message, "text-red-400");
  }
}

function filterGraphPreset(preset) {
  if (!cy) return;
  if (preset === "memory") {
    cy.elements().style("display", "none");
    cy.elements('node[group = "GlobalMemory"], node[group = "Function"], edge[label = "READS"], edge[label = "WRITES"]').style("display", "element");
    cy.layout({ name: "cose", padding: 30, animate: true }).run();
  } else if (preset === "calls") {
    cy.elements().style("display", "none");
    cy.elements('node[group = "Function"], edge[label = "CALLS"]').style("display", "element");
    cy.layout({ name: "cose", padding: 30, animate: true }).run();
  } else {
    cy.elements().style("display", "element");
    cy.layout({ name: "cose", padding: 30, animate: true }).run();
  }
}

// ----------------------------------------------------------------------------
// Utility Helpers
// ----------------------------------------------------------------------------
function openNodeDrawer(data) {
  const drawer = document.getElementById("nodeDetailsDrawer");
  const title = document.getElementById("lblDrawerTitle");
  const content = document.getElementById("drawerContent");

  title.innerText = `${data.group}: ${data.label}`;
  const props = data.properties || {};

  let html = `<div class="text-[10px] uppercase text-slate-500 font-bold mb-1">Properties</div>`;
  for (const [k, v] of Object.entries(props)) {
    if (k !== "pseudocode") {
      html += `<div><span class="text-slate-400">${k}:</span> <span class="text-purple-300 font-medium">${v}</span></div>`;
    }
  }
  if (props.pseudocode) {
    html += `<div class="mt-2 text-[10px] uppercase text-slate-500 font-bold">Pseudocode</div><pre class="bg-black/60 p-2 rounded text-[10px] text-slate-300 max-h-32 overflow-auto"><code>${escapeHtml(props.pseudocode)}</code></pre>`;
  }

  content.innerHTML = html;
  drawer.classList.remove("hidden");
}

function closeNodeDrawer() {
  document.getElementById("nodeDetailsDrawer").classList.add("hidden");
}

function setAgentStepState(cardId, badgeId, text, colorClass, borderClass) {
  const card = document.getElementById(cardId);
  const badge = document.getElementById(badgeId);
  if (badge) {
    badge.innerText = text;
    badge.className = `text-[10px] ${colorClass}`;
  }
  if (card) {
    card.className = `bg-[#0E1424] p-3 rounded-lg border ${borderClass} transition-all`;
  }
}

function logTerminal(prefix, msg, colorClass = "text-slate-300") {
  const term = document.getElementById("agentTerminal");
  if (!term) return;
  const entry = document.createElement("div");
  entry.className = `terminal-entry ${colorClass}`;
  const timestamp = new Date().toLocaleTimeString();
  entry.innerHTML = `<span class="text-slate-500">[${timestamp}]</span> <span class="font-semibold text-purple-400">[${prefix}]</span> ${msg}`;
  term.appendChild(entry);
  term.scrollTop = term.scrollHeight;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
