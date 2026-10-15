// GhostGraph Autonomous Reverse Engineering Platform Frontend Engine
let cy = null;
let currentTarget = "snake";
let currentTargetData = null;
let currentSnippetMode = "disasm"; // Default to authentic raw machine code!
let eventSource = null;
let currentExecutionMode = "grounded"; // "grounded" vs "baseline"

// Initialize on DOM Load
document.addEventListener("DOMContentLoaded", async () => {
  initCytoscape();
  initSnakeCanvas();
  await switchTarget("snake");
});

// ----------------------------------------------------------------------------
// Target Switching & Loading
// ----------------------------------------------------------------------------
async function switchTarget(targetId) {
  try {
    currentTarget = targetId;

    // Update target selector button states
    document.querySelectorAll(".target-tab").forEach(tab => {
      if (tab.dataset.target === targetId) {
        tab.className = "target-tab active text-xs font-mono px-3 py-1.5 rounded-md bg-purple-600/30 text-purple-200 border border-purple-500/50 flex items-center gap-1.5 transition-all";
      } else {
        tab.className = "target-tab text-xs font-mono px-3 py-1.5 rounded-md text-slate-400 hover:text-white border border-transparent transition-all";
      }
    });

    // Reset parity state to clean standby & update runtime immediately
    resetParityUI();
    updateRuntimeSubView(targetId);

    // Fetch target specification & test vectors
    const res = await fetch(`/api/target/details?target_id=${targetId}`);
    currentTargetData = await res.json();
    renderTargetDetails(currentTargetData);

    // Load graph topology & ingest
    await ingestCurrentTarget();
    await loadGraphData();
  } catch (err) {
    console.error("Error in switchTarget:", err);
  }
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

  // Render initial snippet view (Disassembly or Pseudocode)
  toggleSnippetView(currentSnippetMode);

  // Update Code Diff tab Before/After
  document.getElementById("codeDiffBefore").innerText = cfg.decompiled_snippet;
  document.getElementById("codeDiffAfter").innerText = cfg.reconstructed_c;
  document.getElementById("diffResolutionNotice").innerText = `Ground truth memory: ${cfg.mem_label} initialized in ${cfg.producer_fn}`;

  // Update episodic memory target label
  document.getElementById("memTargetLabel").innerText = t.name;

  // Render initial test vectors grid in neutral state
  renderTestVectorGrid(data.test_vectors, "PENDING");
}

function toggleSnippetView(mode) {
  currentSnippetMode = mode;
  const btnDisasm = document.getElementById("btnViewDisasm");
  const btnPseudo = document.getElementById("btnViewPseudo");
  const container = document.getElementById("decompiledSnippetCode");

  if (!currentTargetData || !currentTargetData.config) return;

  if (mode === "disasm") {
    if (btnDisasm) btnDisasm.className = "px-2.5 py-1 rounded text-[11px] bg-purple-600/40 text-purple-200 border border-purple-500/50 flex items-center gap-1 font-bold";
    if (btnPseudo) btnPseudo.className = "px-2.5 py-1 rounded text-[11px] text-slate-400 hover:text-white border border-transparent flex items-center gap-1";
    container.innerHTML = `<code class="language-asm text-purple-200">${escapeHtml(currentTargetData.config.raw_disassembly || "// Stripped binary opcodes unavailable")}</code>`;
  } else {
    if (btnPseudo) btnPseudo.className = "px-2.5 py-1 rounded text-[11px] bg-purple-600/40 text-purple-200 border border-purple-500/50 flex items-center gap-1 font-bold";
    if (btnDisasm) btnDisasm.className = "px-2.5 py-1 rounded text-[11px] text-slate-400 hover:text-white border border-transparent flex items-center gap-1";
    container.innerHTML = `<code class="language-c text-slate-200">${escapeHtml(currentTargetData.config.decompiled_snippet || "// Pseudocode unavailable")}</code>`;
  }
}

function updateRuntimeSubView(targetId) {
  const viewSnake = document.getElementById("runtimeViewSnake");
  const viewTel = document.getElementById("runtimeViewTelemetry");
  const viewKey = document.getElementById("runtimeViewKeygen");
  const lblMode = document.getElementById("runtimeModeNotice");

  if (viewSnake) viewSnake.classList.add("hidden");
  if (viewTel) viewTel.classList.add("hidden");
  if (viewKey) viewKey.classList.add("hidden");

  if (targetId === "snake") {
    if (viewSnake) viewSnake.classList.remove("hidden");
    if (lblMode) lblMode.innerText = "Playable Retro Snake Simulation";
    renderSnakeCanvas();
  } else if (targetId === "telemetry") {
    if (viewTel) viewTel.classList.remove("hidden");
    if (lblMode) lblMode.innerText = "Satellite Downlink Stream Telemetry";
    fetchTelemetryDownlink(true);
  } else if (targetId === "keygen") {
    if (viewKey) viewKey.classList.remove("hidden");
    if (lblMode) lblMode.innerText = "License Checksum & S-Box Validator";
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

  const buttons = document.querySelectorAll(".nav-tab");
  buttons.forEach(btn => {
    if (btn.getAttribute("onclick") && btn.getAttribute("onclick").includes(tabId)) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  if (tabId === "graph" && cy) {
    setTimeout(() => {
      cy.resize();
      applyCleanHierarchicalLayout();
    }, 100);
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
          "width": "28px",
          "height": "28px",
          "border-width": "2px",
          "border-color": "#4C1D95",
          "transition-property": "background-color, border-color, width, height",
          "transition-duration": "0.3s"
        }
      },
      {
        selector: 'node[group = "Program"]',
        style: {
          "background-color": "#2563EB",
          "border-color": "#1E40AF",
          "shape": "round-rectangle",
          "width": "140px",
          "height": "32px",
          "text-valign": "center",
          "text-margin-y": "0px",
          "font-weight": "bold",
          "color": "#FFFFFF"
        }
      },
      {
        selector: 'node[group = "GlobalMemory"]',
        style: {
          "background-color": "#F59E0B",
          "border-color": "#78350F",
          "shape": "diamond",
          "width": "32px",
          "height": "32px"
        }
      },
      {
        selector: 'node[group = "TestCase"]',
        style: {
          "background-color": "#10B981",
          "border-color": "#064E3B",
          "shape": "round-rectangle",
          "width": "24px",
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
          "width": "34px",
          "height": "34px",
          "border-width": "3px",
          "font-weight": "bold",
          "color": "#FDF2F8"
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
        selector: 'edge[label = "RECONSTRUCTS"]',
        style: {
          "line-color": "#EC4899",
          "target-arrow-color": "#EC4899",
          "width": 2.5,
          "line-style": "solid"
        }
      },
      {
        selector: 'edge[label = "FAILED_ON"]',
        style: {
          "line-color": "#EF4444",
          "target-arrow-color": "#EF4444",
          "width": 2.5,
          "line-style": "dashed"
        }
      },
      {
        selector: 'edge[label = "PASSED"]',
        style: {
          "line-color": "#10B981",
          "target-arrow-color": "#10B981",
          "width": 2,
          "line-style": "solid"
        }
      },
      // Dynamic Glowing Pulse Classes
      {
        selector: ".node-pulsing",
        style: {
          "border-color": "#A78BFA",
          "border-width": "6px",
          "width": "38px",
          "height": "38px"
        }
      },
      {
        selector: ".node-active-memory",
        style: {
          "background-color": "#FCD34D",
          "border-color": "#F59E0B",
          "border-width": "6px",
          "width": "40px",
          "height": "40px"
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
    layout: { name: "preset" }
  });

  cy.on("tap", "node", (evt) => {
    const node = evt.target;
    openNodeDrawer(node.data());
  });
}

// ----------------------------------------------------------------------------
// Hierarchical Zero-Lag Tiered Layout (Never freezes UI thread)
// ----------------------------------------------------------------------------
function applyCleanHierarchicalLayout() {
  if (!cy) return;
  const nodes = cy.nodes();
  if (nodes.length === 0) return;

  const w = cy.width() || 1000;
  const programs = nodes.filter('[group = "Program"]');
  const functions = nodes.filter('[group = "Function"]');
  const memory = nodes.filter('[group = "GlobalMemory"]');
  const testcases = nodes.filter('[group = "TestCase"]');
  const candidates = nodes.filter('[group = "Candidate"]');

  // Tier 1 (y=40): Program root
  programs.forEach((n, i) => {
    n.position({ x: w / 2 + (i - (programs.length - 1) / 2) * 200, y: 50 });
  });

  // Tier 2 (y=140): Functions
  const fnCount = functions.length || 1;
  const fnSpacing = Math.min(180, (w - 100) / fnCount);
  functions.forEach((n, i) => {
    n.position({ x: 80 + i * fnSpacing, y: 150 });
  });

  // Tier 3 (y=260): GlobalMemory
  const memCount = memory.length || 1;
  const memSpacing = Math.min(220, (w - 120) / memCount);
  memory.forEach((n, i) => {
    n.position({ x: 120 + i * memSpacing, y: 260 });
  });

  // Tier 4 (y=370): TestCases (compact rows)
  const tcPerRow = Math.max(5, Math.ceil(testcases.length / 2));
  const tcSpacing = Math.min(75, (w - 60) / tcPerRow);
  testcases.forEach((n, i) => {
    const row = Math.floor(i / tcPerRow);
    const col = i % tcPerRow;
    n.position({ x: 50 + col * tcSpacing, y: 370 + row * 40 });
  });

  // Tier 5 (y=480): Candidates
  candidates.forEach((n, i) => {
    n.position({ x: w / 2 + (i - (candidates.length - 1) / 2) * 200, y: 480 });
  });

  cy.fit(nodes, 40);
}

async function loadGraphData() {
  try {
    const res = await fetch("/api/graph");
    const data = await res.json();
    if (data.nodes && data.nodes.length > 0 && cy) {
      cy.elements().remove();
      const nodeSet = new Set(data.nodes.map(n => String(n.data.id)));
      const safeEdges = (data.edges || []).filter(e => nodeSet.has(String(e.data.source)) && nodeSet.has(String(e.data.target)));
      cy.add(data.nodes);
      cy.add(safeEdges);
      applyCleanHierarchicalLayout();
    }
  } catch (err) {
    console.warn("Could not load graph topology:", err);
  }
}

// ----------------------------------------------------------------------------
// Multi-Agent Pipeline Execution: Mode A (Baseline) vs Mode B (GhostGraph)
// ----------------------------------------------------------------------------

function runBaselineMode() {
  document.getElementById("swarmPipelineSection").classList.remove("hidden");
  document.getElementById("agentStatusBadge").innerText = "Executing Vanilla LLM (No Graph Context)...";
  document.getElementById("agentStatusBadge").className = "text-xs font-mono px-2.5 py-0.5 rounded bg-red-950 text-red-300 border border-red-800/60 animate-pulse";

  setAgentStepState("cardAgentTopology", "badgeAgentTopology", "BYPASSED", "text-slate-500", "border-slate-800");
  setAgentStepState("cardAgentReconstruction", "badgeAgentReconstruction", "ISOLATED PROMPT", "text-amber-400 font-bold", "border-amber-600");
  setAgentStepState("cardAgentVerification", "badgeAgentVerification", "DIFF TESTING", "text-red-400 font-bold", "border-red-600");
  setAgentStepState("cardAgentSupervisor", "badgeAgentSupervisor", "LOGGING FAILURES", "text-slate-400", "border-slate-800");

  document.getElementById("lblActiveCypher").innerText = "NONE (Flat LLM has no graph access. Memory pointers ungrounded).";

  logTerminal("Baseline", "Initiating Vanilla LLM Reconstruction without FalkorDB graph context...", "text-red-400 font-bold");
  logTerminal("LLM", `Attempting inference on isolated function '${currentTargetData?.config?.primary_fn}'...`, "text-slate-300");
  logTerminal("Warning", `LLM has no visibility into memory address ${currentTargetData?.config?.critical_mem}. Guessing zeroed placeholder!`, "text-amber-400 font-bold");

  executePipelineStream(false);
}

function runGhostGraphSwarm() {
  document.getElementById("swarmPipelineSection").classList.remove("hidden");
  document.getElementById("agentStatusBadge").innerText = "GhostGraph Swarm Active (FalkorDB Context)...";
  document.getElementById("agentStatusBadge").className = "text-xs font-mono px-2.5 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800/60";

  logTerminal("Supervisor", "Autonomous Swarm launched. Orchestrating multi-agent reverse engineering loop...", "text-purple-300 font-bold");

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

// ----------------------------------------------------------------------------
// Real-Time Event Handler with Dynamic Graph Growth
// ----------------------------------------------------------------------------
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

        // Visual light pulse along traversal path
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

      // TRACK 02 PROOF: DYNAMICALLY SPAWN CANDIDATE NODE ON GRAPH CANVAS!
      if (cy && !cy.getElementById(data.candidate_id).length) {
        cy.add({
          group: "nodes",
          data: {
            id: data.candidate_id,
            label: data.candidate_id,
            group: "Candidate",
            properties: { version: data.version, memory: data.resolved_memory_count }
          },
          position: { x: (cy.width() || 1000) / 2, y: 480 }
        });

        // Connect RECONSTRUCTS edge to target function
        if (data.target_function) {
          const fnNode = cy.nodes().filter(n => n.data("label") === data.target_function);
          if (fnNode.length) {
            cy.add({
              group: "edges",
              data: {
                source: data.candidate_id,
                target: fnNode.id(),
                label: "RECONSTRUCTS"
              }
            });
          }
        }
        applyCleanHierarchicalLayout();
      }
      break;

    case "VERIFICATION_RESULT":
      renderParityOutcome(data.parity_percentage, data.passed, data.total, data.results, useGraph);
      setAgentStepState("cardAgentVerification", "badgeAgentVerification", `${data.parity_percentage}% PARITY`, data.parity_percentage === 100.0 ? "text-emerald-400 font-bold" : "text-red-400 font-bold", "border-slate-700");
      setAgentStepState("cardAgentSupervisor", "badgeAgentSupervisor", "CONVERGED", "text-emerald-400 font-bold", "border-emerald-600");

      // TRACK 02 PROOF: DYNAMICALLY CONNECT TEST RESULT EDGES ON GRAPH CANVAS!
      if (cy && data.candidate_id) {
        const candId = data.candidate_id;

        // Draw FAILED_ON edges for failed test vectors
        (data.failed_test_ids || []).forEach(tid => {
          const tcNode = cy.nodes().filter(n => n.data("label") === tid);
          if (tcNode.length) {
            const edgeId = `edge_${candId}_${tid}`;
            if (!cy.getElementById(edgeId).length) {
              cy.add({
                group: "edges",
                data: { id: edgeId, source: candId, target: tcNode.id(), label: "FAILED_ON" }
              });
            }
          }
        });

        // Draw PASSED edges for passing test vectors
        (data.passed_test_ids || []).forEach(tid => {
          const tcNode = cy.nodes().filter(n => n.data("label") === tid);
          if (tcNode.length) {
            const edgeId = `edge_${candId}_${tid}`;
            if (!cy.getElementById(edgeId).length) {
              cy.add({
                group: "edges",
                data: { id: edgeId, source: candId, target: tcNode.id(), label: "PASSED" }
              });
            }
          }
        });
      }
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

// ============================================================================
// Retro Snake Arcade Canvas State & Complete Game Engine
// ============================================================================
let snakeCanvas, snakeCtx;
let snakeLoopInterval = null;
let isSnakePlaying = false;
let snakeHighScore = 140;

let snakeState = {
  score: 0,
  length: 3,
  alive: true,
  food: { x: 15, y: 10 },
  currentDir: 1, // 0=UP, 1=RIGHT, 2=DOWN, 3=LEFT
  body: [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }]
};

function initSnakeCanvas() {
  snakeCanvas = document.getElementById("snakeCanvas");
  if (snakeCanvas) {
    snakeCtx = snakeCanvas.getContext("2d");
  }

  // Real keyboard arrow key controls for authentic gameplay!
  window.addEventListener("keydown", (e) => {
    if (currentTarget !== "snake") return;
    if (e.key === "ArrowUp") {
      e.preventDefault();
      sendSnakeDirection(0);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      sendSnakeDirection(1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      sendSnakeDirection(2);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      sendSnakeDirection(3);
    } else if (e.key === " ") {
      e.preventDefault();
      toggleSnakePlayLoop();
    }
  });

  renderSnakeCanvas();
}

function renderSnakeCanvas() {
  if (!snakeCtx || !snakeCanvas) return;
  const w = snakeCanvas.width;
  const h = snakeCanvas.height;
  const gridSize = 20;
  const cell = w / gridSize; // 20px per cell

  // 1. Dark CRT Phosphor Background
  snakeCtx.fillStyle = "#050811";
  snakeCtx.fillRect(0, 0, w, h);

  // 2. Subtle CRT grid lines
  snakeCtx.strokeStyle = "#0E182E";
  snakeCtx.lineWidth = 1;
  for (let i = 0; i <= gridSize; i++) {
    snakeCtx.beginPath();
    snakeCtx.moveTo(i * cell, 0);
    snakeCtx.lineTo(i * cell, h);
    snakeCtx.stroke();

    snakeCtx.beginPath();
    snakeCtx.moveTo(0, i * cell);
    snakeCtx.lineTo(w, i * cell);
    snakeCtx.stroke();
  }

  // 3. Render Food (Glowing Red Apple)
  if (snakeState.food) {
    const fx = snakeState.food.x * cell;
    const fy = snakeState.food.y * cell;

    snakeCtx.shadowColor = "#EF4444";
    snakeCtx.shadowBlur = 10;
    snakeCtx.fillStyle = "#EF4444";
    snakeCtx.beginPath();
    snakeCtx.arc(fx + cell / 2, fy + cell / 2, cell / 2 - 2, 0, Math.PI * 2);
    snakeCtx.fill();

    // Food highlight dot
    snakeCtx.fillStyle = "#FCA5A5";
    snakeCtx.beginPath();
    snakeCtx.arc(fx + cell / 2 - 2, fy + cell / 2 - 2, 2, 0, Math.PI * 2);
    snakeCtx.fill();
    snakeCtx.shadowBlur = 0;
  }

  // 4. Render Snake Body Segments
  const body = snakeState.body || [];
  body.forEach((seg, idx) => {
    const sx = seg.x * cell;
    const sy = seg.y * cell;

    if (idx === 0) {
      // Snake Head (Bright glowing Lime Green)
      snakeCtx.shadowColor = "#10B981";
      snakeCtx.shadowBlur = 8;
      snakeCtx.fillStyle = "#34D399";
      snakeCtx.fillRect(sx + 1, sy + 1, cell - 2, cell - 2);

      // Two eyes pointing in movement direction
      snakeCtx.fillStyle = "#000000";
      const dir = snakeState.currentDir;
      let eye1 = [sx + 5, sy + 5], eye2 = [sx + 15, sy + 5];
      if (dir === 1) { eye1 = [sx + 14, sy + 5]; eye2 = [sx + 14, sy + 15]; } // Right
      else if (dir === 2) { eye1 = [sx + 5, sy + 14]; eye2 = [sx + 15, sy + 14]; } // Down
      else if (dir === 3) { eye1 = [sx + 5, sy + 5]; eye2 = [sx + 5, sy + 15]; } // Left

      snakeCtx.fillRect(eye1[0] - 1, eye1[1] - 1, 3, 3);
      snakeCtx.fillRect(eye2[0] - 1, eye2[1] - 1, 3, 3);
      snakeCtx.shadowBlur = 0;
    } else {
      // Snake Body Segment
      const alpha = Math.max(0.4, 1.0 - (idx / body.length) * 0.5);
      snakeCtx.fillStyle = `rgba(16, 185, 129, ${alpha})`;
      snakeCtx.fillRect(sx + 2, sy + 2, cell - 4, cell - 4);
      snakeCtx.strokeStyle = "#047857";
      snakeCtx.lineWidth = 1;
      snakeCtx.strokeRect(sx + 2, sy + 2, cell - 4, cell - 4);
    }
  });

  // Update HUD values
  if (document.getElementById("lblSnakeScore")) document.getElementById("lblSnakeScore").innerText = snakeState.score;
  if (document.getElementById("lblSnakeLength")) document.getElementById("lblSnakeLength").innerText = snakeState.length;
  if (document.getElementById("lblSnakeHighScore")) document.getElementById("lblSnakeHighScore").innerText = Math.max(snakeHighScore, snakeState.score);
}

async function sendSnakeDirection(dir) {
  snakeState.currentDir = dir;
  await stepSnake();
}

async function stepSnake() {
  try {
    const isBroken = (currentExecutionMode === "baseline");
    const res = await fetch("/api/snake/step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dir: snakeState.currentDir, is_broken_mode: isBroken })
    });
    const data = await res.json();
    snakeState.score = data.score;
    snakeState.length = data.length;
    snakeState.alive = data.alive;
    snakeState.food = data.food;
    snakeState.body = data.body;
    snakeState.currentDir = data.dir;

    const overlay = document.getElementById("snakeGlitchOverlay");
    const statusEl = document.getElementById("lblSnakeStatus");

    if (!data.alive) {
      if (isBroken && overlay) overlay.classList.remove("hidden");
      if (statusEl) {
        statusEl.innerText = isBroken ? "MEMORY FAULT (CRASHED)" : "GAME OVER (WALL IMPACT)";
        statusEl.className = "px-2.5 py-0.5 rounded bg-red-950 text-red-400 border border-red-800 text-[11px] font-bold";
      }
      stopSnakeLoop();
    } else {
      if (overlay) overlay.classList.add("hidden");
      if (statusEl) {
        statusEl.innerText = "AUTONOMOUS RECONSTRUCTED (60 FPS)";
        statusEl.className = "px-2.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 text-[11px] font-bold";
      }
    }

    renderSnakeCanvas();
  } catch (err) {
    console.warn("Snake step tick failed:", err);
  }
}

function toggleSnakePlayLoop() {
  if (isSnakePlaying) {
    stopSnakeLoop();
  } else {
    startSnakeLoop();
  }
}

function startSnakeLoop() {
  isSnakePlaying = true;
  const btn = document.getElementById("lblSnakePlayBtn");
  const icon = document.getElementById("iconSnakePlay");
  if (btn) btn.innerText = "Pause Simulation";
  if (icon) icon.className = "fa-solid fa-pause";

  if (snakeLoopInterval) clearInterval(snakeLoopInterval);
  snakeLoopInterval = setInterval(() => {
    stepSnake();
  }, 130);
}

function stopSnakeLoop() {
  isSnakePlaying = false;
  const btn = document.getElementById("lblSnakePlayBtn");
  const icon = document.getElementById("iconSnakePlay");
  if (btn) btn.innerText = "Run Arcade Loop";
  if (icon) icon.className = "fa-solid fa-play";

  if (snakeLoopInterval) {
    clearInterval(snakeLoopInterval);
    snakeLoopInterval = null;
  }
}

async function resetSnakeGame() {
  stopSnakeLoop();
  try {
    const res = await fetch("/api/snake/reset", { method: "POST" });
    const data = await res.json();
    snakeState.score = data.score;
    snakeState.length = data.length;
    snakeState.alive = data.alive;
    snakeState.food = data.food;
    snakeState.body = data.body;
    snakeState.currentDir = data.dir;

    const overlay = document.getElementById("snakeGlitchOverlay");
    if (overlay) overlay.classList.add("hidden");

    const statusEl = document.getElementById("lblSnakeStatus");
    if (statusEl) {
      statusEl.innerText = "AUTONOMOUS RECONSTRUCTED (60 FPS)";
      statusEl.className = "px-2.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 text-[11px] font-bold";
    }

    renderSnakeCanvas();
  } catch (err) {
    console.warn("Reset snake error:", err);
  }
}

// Standalone C Project Export Modal Handlers
let exportedCodeText = "";
async function exportCProject() {
  try {
    const res = await fetch(`/api/export?target_id=${currentTarget}`);
    const data = await res.json();
    exportedCodeText = data.source_code;
    document.getElementById("exportFilename").innerText = data.filename;
    document.getElementById("exportCompileCmd").innerText = data.compile_cmd;
    document.getElementById("exportCodeContent").innerText = data.source_code;
    document.getElementById("exportModal").classList.remove("hidden");
  } catch (err) {
    console.warn("Export failed:", err);
  }
}

function closeExportModal() {
  document.getElementById("exportModal").classList.add("hidden");
}

function copyExportedCode() {
  if (navigator.clipboard && exportedCodeText) {
    navigator.clipboard.writeText(exportedCodeText);
    logTerminal("Export", "Compilable C code copied to clipboard!", "text-emerald-400 font-bold");
  }
}

function downloadExportedFile() {
  if (!exportedCodeText) return;
  const filename = document.getElementById("exportFilename").innerText || "reconstructed.c";
  const blob = new Blob([exportedCodeText], { type: "text/x-csrc" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

async function injectTelemetryTest(isNominal) {
  try {
    const res = await fetch(`/api/telemetry/downlink?is_reconstructed=${isNominal}`);
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
    console.warn("Inject telemetry test failed:", err);
  }
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
    applyCleanHierarchicalLayout();
  } else if (preset === "calls") {
    cy.elements().style("display", "none");
    cy.elements('node[group = "Function"], edge[label = "CALLS"]').style("display", "element");
    applyCleanHierarchicalLayout();
  } else {
    cy.elements().style("display", "element");
    applyCleanHierarchicalLayout();
  }
}

// ----------------------------------------------------------------------------
// Utility Helpers & Window Bindings
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

// Explicit window bindings for inline HTML onclick handlers
window.switchTarget = switchTarget;
window.toggleSnippetView = toggleSnippetView;
window.runBaselineMode = runBaselineMode;
window.runGhostGraphSwarm = runGhostGraphSwarm;
window.switchTab = switchTab;
window.runCustomCypher = runCustomCypher;
window.filterGraphPreset = filterGraphPreset;
window.openNodeDrawer = openNodeDrawer;
window.closeNodeDrawer = closeNodeDrawer;
window.toggleSnakePlayLoop = toggleSnakePlayLoop;
window.resetSnakeGame = resetSnakeGame;
window.sendSnakeDirection = sendSnakeDirection;
window.injectTelemetryTest = injectTelemetryTest;
window.exportCProject = exportCProject;
window.closeExportModal = closeExportModal;
window.copyExportedCode = copyExportedCode;
window.downloadExportedFile = downloadExportedFile;
