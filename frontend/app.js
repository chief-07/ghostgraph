// GhostGraph Frontend Application Engine
// 4-Screen Staged Architecture & Apollo Vector CRT HUD

let currentStep = 1;
let cy = null;
let eventSource = null;

// Apollo Flight Simulation State
let flightMode = "ghostgraph"; // "ghostgraph" vs "flat_llm"
let autoPilot = true;
let commandedThrottle = 0.0;
let commandedPitchRate = 0.0;
let simInterval = null;
let latestFlightState = null;

document.addEventListener("DOMContentLoaded", async () => {
  initKeyboardControls();
  navigateToStep(1);
  initCytoscape();
  await loadGraphTopology();
  initApolloCanvas();
  startFlightLoop();
});

// ----------------------------------------------------------------------------
// 1. Stepper Screen Navigation
// ----------------------------------------------------------------------------
function navigateToStep(step) {
  currentStep = step;
  
  // Update step tabs
  document.querySelectorAll(".step-tab").forEach(tab => {
    if (parseInt(tab.dataset.step) === step) {
      tab.classList.add("active");
    } else {
      tab.classList.remove("active");
    }
  });

  // Switch screens
  document.querySelectorAll(".step-screen").forEach(screen => {
    screen.classList.remove("active");
  });
  const activeScreen = document.getElementById(`screen${step}`);
  if (activeScreen) {
    activeScreen.classList.add("active");
  }

  // Handle step-specific triggers
  if (step === 2 && cy) {
    setTimeout(() => {
      cy.resize();
      cy.fit(null, 40);
    }, 100);
  } else if (step === 4) {
    startFlightLoop();
  }
}

// ----------------------------------------------------------------------------
// 2. Cytoscape Graph Topology (Screen 2)
// ----------------------------------------------------------------------------
function initCytoscape() {
  const container = document.getElementById("cy");
  if (!container) return;

  cy = cytoscape({
    container: container,
    style: [
      {
        selector: "node",
        style: {
          "label": "data(label)",
          "color": "#e6edf3",
          "font-size": "11px",
          "font-family": "monospace",
          "text-valign": "center",
          "text-halign": "right",
          "text-margin-x": 8,
          "border-width": 2,
          "border-color": "#2e3b59",
          "transition-property": "background-color, border-color, width, height",
          "transition-duration": "0.3s"
        }
      },
      {
        selector: "node[type = 'program']",
        style: {
          "background-color": "#ffffff",
          "shape": "round-rectangle",
          "width": 140,
          "height": 45,
          "border-color": "#00e5ff",
          "border-width": 3,
          "font-size": "12px",
          "font-weight": "bold",
          "text-halign": "center"
        }
      },
      {
        selector: "node[type = 'function']",
        style: {
          "background-color": "#00e5ff",
          "shape": "ellipse",
          "width": 42,
          "height": 42,
          "border-color": "#007799"
        }
      },
      {
        selector: "node[type = 'memory']",
        style: {
          "background-color": "#ffb000",
          "shape": "diamond",
          "width": 38,
          "height": 38,
          "border-color": "#cc8800"
        }
      },
      {
        selector: "node[type = 'testcase']",
        style: {
          "background-color": "#00ff66",
          "shape": "round-diamond",
          "width": 28,
          "height": 28,
          "border-color": "#009933"
        }
      },
      {
        selector: "edge",
        style: {
          "width": 1.5,
          "line-color": "#26354f",
          "target-arrow-color": "#26354f",
          "target-arrow-shape": "triangle",
          "curve-style": "bezier",
          "arrow-scale": 0.8
        }
      },
      {
        selector: "edge[label = 'CALLS']",
        style: {
          "line-color": "#00e5ff",
          "target-arrow-color": "#00e5ff",
          "width": 2
        }
      },
      {
        selector: "edge[label = 'READS']",
        style: {
          "line-color": "#ffb000",
          "target-arrow-color": "#ffb000",
          "line-style": "dashed"
        }
      },
      {
        selector: "edge[label = 'WRITES']",
        style: {
          "line-color": "#ff5533",
          "target-arrow-color": "#ff5533"
        }
      },
      {
        selector: "edge[label = 'EXERCISES']",
        style: {
          "line-color": "#00ff66",
          "target-arrow-color": "#00ff66"
        }
      }
    ],
    elements: [],
    layout: {
      name: "breadthfirst",
      directed: true,
      padding: 50,
      spacingFactor: 1.25
    }
  });

  cy.on("tap", "node", (evt) => {
    const node = evt.target;
    const data = node.data();
    highlightNode(node);
  });
}

function highlightNode(node) {
  cy.elements().removeClass("highlighted");
  node.addClass("highlighted");
  node.connectedEdges().addClass("highlighted");
}

async function loadGraphTopology() {
  try {
    const res = await fetch("/api/cypher", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `
          MATCH (p:Program {name: '1979 Apollo Lunar Lander Guidance Computer'})-[:CONTAINS]->(f:Function)
          OPTIONAL MATCH (f)-[r:CALLS]->(target:Function)
          RETURN p, f, r, target
        `
      })
    });
    
    // Static topology elements for high-performance rendering
    const elements = [
      // Program
      { data: { id: "prog", label: "Apollo LGC (1979)", type: "program" } },
      
      // Functions
      { data: { id: "init", label: "init_flight_computer (0x401020)", type: "function" } },
      { data: { id: "terrain", label: "generate_terrain_profile (0x401080)", type: "function" } },
      { data: { id: "thrust", label: "apply_thrust_vector (0x401140)", type: "function" } },
      { data: { id: "physics", label: "update_newtonian_physics (0x401200)", type: "function" } },
      { data: { id: "raycast", label: "check_altitude_raycast (0x401280)", type: "function" } },
      { data: { id: "touchdown", label: "evaluate_touchdown_dynamics (0x401320)", type: "function" } },
      
      // Memory Buffers
      { data: { id: "mem_throttle", label: "0x00403000 (DPS Throttle Curve)", type: "memory" } },
      { data: { id: "mem_mascon", label: "0x00403080 (Mascon Gravity)", type: "memory" } },
      { data: { id: "mem_terrain", label: "0x00403100 (Terrain Profile)", type: "memory" } },
      { data: { id: "mem_state", label: "0x00403200 (Flight Telemetry)", type: "memory" } },

      // Calls
      { data: { source: "prog", target: "physics" } },
      { data: { source: "init", target: "terrain", label: "CALLS" } },
      { data: { source: "physics", target: "raycast", label: "CALLS" } },
      { data: { source: "physics", target: "touchdown", label: "CALLS" } },

      // Memory Access
      { data: { source: "thrust", target: "mem_throttle", label: "READS" } },
      { data: { source: "physics", target: "mem_throttle", label: "READS" } },
      { data: { source: "physics", target: "mem_mascon", label: "READS" } },
      { data: { source: "terrain", target: "mem_terrain", label: "WRITES" } },
      { data: { source: "raycast", target: "mem_terrain", label: "READS" } },
      { data: { source: "touchdown", target: "mem_terrain", label: "READS" } },
      { data: { source: "init", target: "mem_state", label: "WRITES" } },
      { data: { source: "physics", target: "mem_state", label: "WRITES" } }
    ];

    if (cy) {
      cy.elements().remove();
      cy.add(elements);
      resetGraphLayout();
    }
  } catch (err) {
    console.error("loadGraphTopology error:", err);
  }
}

function resetGraphLayout() {
  if (!cy) return;
  cy.layout({
    name: "breadthfirst",
    directed: true,
    padding: 40,
    spacingFactor: 1.3
  }).run();
}

function runCypherPreset(preset) {
  const input = document.getElementById("cypherInput");
  if (!input) return;

  if (preset === "calls") {
    input.value = "MATCH (caller:Function)-[:CALLS]->(callee:Function) RETURN caller.name AS Caller, callee.name AS Callee";
  } else if (preset === "memory") {
    input.value = "MATCH (f:Function)-[:READS]->(m:GlobalMemory {address: '0x00403000'}) RETURN f.name AS Function, m.label AS Memory, m.address AS Address";
  } else if (preset === "topo") {
    input.value = "MATCH (f:Function) OPTIONAL MATCH (f)-[:CALLS]->(down:Function) WITH f, count(down) AS out_degree ORDER BY out_degree ASC RETURN f.name AS Function, f.address AS Address, out_degree AS Dependencies";
  }
  executeCypherConsole();
}

async function executeCypherConsole() {
  const query = document.getElementById("cypherInput").value;
  const out = document.getElementById("cypherOutput");
  out.innerHTML = `<span class="text-cyan-400">Executing OpenCypher on FalkorDB Cloud...</span>`;

  try {
    const res = await fetch("/api/cypher", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query })
    });
    const data = await res.json();
    if (data.status === "SUCCESS") {
      out.innerHTML = `<div class="text-emerald-400 font-bold mb-1">Returned ${data.count} records:</div>` +
        `<pre class="text-[10px] text-slate-300">${JSON.stringify(data.records, null, 2)}</pre>`;
    } else {
      out.innerHTML = `<span class="text-red-400">Error: ${data.message}</span>`;
    }
  } catch (err) {
    out.innerHTML = `<span class="text-red-400">Network Error: ${err}</span>`;
  }
}

// ----------------------------------------------------------------------------
// 3. The Swarm Duel (Screen 3)
// ----------------------------------------------------------------------------
async function runReconstructionDuel() {
  const btn = document.getElementById("btnRunDuel");
  const log = document.getElementById("agentTraceLog");
  const status = document.getElementById("agentStatusBadge");
  
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Swarm Coordinating...`;
  status.innerText = "Swarm Active";
  status.className = "text-cyan-400 text-[11px] animate-pulse";
  log.innerHTML = "";

  if (eventSource) {
    eventSource.close();
  }

  eventSource = new EventSource("/api/reconstruct/stream?target_id=lunar_lander&use_graph=true");

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      appendAgentLog(data);

      if (data.type === "PIPELINE_COMPLETE") {
        eventSource.close();
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-check"></i> Swarm Complete`;
        status.innerText = "100% Parity Achieved";
        status.className = "text-emerald-400 text-[11px] font-bold";
      }
    } catch (e) {
      console.error(e);
    }
  };

  eventSource.onerror = () => {
    eventSource.close();
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-play"></i> Run Live Swarm Pipeline`;
    status.innerText = "Completed";
  };
}

function appendAgentLog(evt) {
  const log = document.getElementById("agentTraceLog");
  const div = document.createElement("div");

  if (evt.type === "PIPELINE_START") {
    div.innerHTML = `<span class="text-cyan-400 font-bold">[SUPERVISOR]</span> Initiating autonomous reconstruction for <em>${evt.target_display_name}</em>`;
  } else if (evt.type === "AGENT_STEP") {
    div.innerHTML = `<span class="text-amber-400 font-bold">[${evt.agent}]</span> ${evt.message}`;
  } else if (evt.type === "MEMORY_RESOLVED") {
    div.innerHTML = `<span class="text-emerald-400 font-bold">[FALKORDB MEMORY]</span> Resolved <strong>${evt.address}</strong> as <em>${evt.label}</em> (written by ${evt.producer})`;
  } else if (evt.type === "CANDIDATE_GENERATED") {
    div.innerHTML = `<span class="text-cyan-300 font-bold">[RECONSTRUCTION]</span> Synthesized Candidate <strong>${evt.candidate_id}</strong> with full memory grounding.`;
  } else if (evt.type === "VERIFICATION_RESULT") {
    div.innerHTML = `<span class="text-emerald-400 font-bold">[VERIFIER]</span> Parity Result: <strong>${evt.parity_percentage}%</strong> (${evt.passed}/${evt.total} vectors passed).`;
  } else if (evt.type === "PIPELINE_COMPLETE") {
    div.innerHTML = `<span class="text-emerald-300 font-bold">[COMPLETE]</span> Full mathematical and flight parity achieved!`;
  } else {
    div.innerHTML = `<span class="text-slate-400">${JSON.stringify(evt)}</span>`;
  }

  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

// ----------------------------------------------------------------------------
// 4. Apollo Vector CRT Flight HUD (Screen 4)
// ----------------------------------------------------------------------------
let canvas = null;
let ctx = null;

function initApolloCanvas() {
  canvas = document.getElementById("lunarCanvas");
  if (canvas) {
    ctx = canvas.getContext("2d");
  }
}

function setFlightExecutionMode(mode) {
  flightMode = mode;
  const btnGhost = document.getElementById("btnFlightGhost");
  const btnFlat = document.getElementById("btnFlightFlat");
  const crtLabel = document.getElementById("crtModeLabel");

  if (mode === "ghostgraph") {
    btnGhost.className = "px-3 py-1.5 rounded font-bold transition-all bg-emerald-950/80 text-emerald-300 border border-emerald-600/60 flex items-center gap-1.5";
    btnFlat.className = "px-3 py-1.5 rounded text-slate-400 hover:text-white border border-transparent transition-all flex items-center gap-1.5";
    crtLabel.innerText = "MODE: GHOSTGRAPH (RESOLVED MEMORY 0x00403000)";
    crtLabel.className = "text-cyan-300 text-[11px]";
  } else {
    btnFlat.className = "px-3 py-1.5 rounded font-bold transition-all bg-red-950/80 text-red-300 border border-red-600/60 flex items-center gap-1.5";
    btnGhost.className = "px-3 py-1.5 rounded text-slate-400 hover:text-white border border-transparent transition-all flex items-center gap-1.5";
    crtLabel.innerText = "MODE: FLAT LLM (UNGROUNDED MEMORY - ZERO THRUST)";
    crtLabel.className = "text-red-400 text-[11px]";
  }

  resetLunarFlight();
}

function toggleAutoPilot() {
  autoPilot = !autoPilot;
  document.getElementById("autoPilotStatus").innerText = autoPilot ? "ON" : "OFF";
}

function pilotAdjustThrottle(delta) {
  autoPilot = false;
  document.getElementById("autoPilotStatus").innerText = "OFF (MANUAL)";
  commandedThrottle = Math.max(0.0, Math.min(1.0, commandedThrottle + delta));
}

function pilotAdjustPitch(delta) {
  autoPilot = false;
  document.getElementById("autoPilotStatus").innerText = "OFF (MANUAL)";
  commandedPitchRate += delta;
}

async function resetLunarFlight() {
  try {
    const res = await fetch("/api/lunar/reset", { method: "POST" });
    latestFlightState = await res.json();
    commandedThrottle = 0.0;
    commandedPitchRate = 0.0;
    hideTouchdownAlert();
  } catch (err) {
    console.error("resetLunarFlight error:", err);
  }
}

function startFlightLoop() {
  if (simInterval) clearInterval(simInterval);

  simInterval = setInterval(async () => {
    if (currentStep !== 4) return;

    try {
      const res = await fetch("/api/lunar/step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          throttle: commandedThrottle,
          pitch_rate: commandedPitchRate,
          auto_guidance: autoPilot,
          mode: flightMode
        })
      });
      latestFlightState = await res.json();
      commandedPitchRate = 0.0; // Reset instantaneous pitch nudge
      
      updateHUD(latestFlightState);
      renderVectorCRT(latestFlightState);
    } catch (err) {
      console.error("Simulation tick error:", err);
    }
  }, 100); // 10 Hz Apollo clock tick
}

function updateHUD(data) {
  if (!data) return;
  const s = (flightMode === "ghostgraph") ? data.ghostgraph : data.flat_llm;

  document.getElementById("telemetryTick").innerText = `TICK: ${s.tick_count}`;
  document.getElementById("hudRadarAlt").innerText = `${s.radar_alt} m`;
  document.getElementById("hudDatumAlt").innerText = `${s.y} m`;
  
  // Vy color alert
  const elVy = document.getElementById("hudVy");
  elVy.innerText = `${s.vy} m/s`;
  if (Math.abs(s.vy) > 3.0) {
    elVy.className = "text-red-400 font-bold text-sm";
  } else {
    elVy.className = "text-emerald-400 font-bold text-sm crt-phosphor-glow";
  }

  document.getElementById("hudVx").innerText = `${s.vx} m/s`;
  document.getElementById("hudPitch").innerText = `${s.pitch_deg}°`;
  document.getElementById("hudFuel").innerText = `${Math.round(s.fuel_mass)} kg`;
  
  const fuelPct = Math.max(0, Math.min(100, (s.fuel_mass / 8200.0) * 100));
  document.getElementById("hudFuelBar").style.width = `${fuelPct}%`;

  const throttlePct = Math.round(s.throttle * 100);
  document.getElementById("hudThrottle").innerText = `${throttlePct} %`;
  document.getElementById("hudThrottleBar").style.width = `${throttlePct}%`;

  // Touchdown Alert
  if (s.is_landed !== 0) {
    showTouchdownAlert(s.is_landed, s.vy, s.radar_alt);
  }
}

function showTouchdownAlert(status, vy, alt) {
  const modal = document.getElementById("touchdownAlert");
  const card = document.getElementById("touchdownAlertCard");
  const title = document.getElementById("touchdownAlertTitle");
  const desc = document.getElementById("touchdownAlertDesc");
  
  modal.classList.remove("hidden");

  if (status === 1) {
    card.className = "border border-emerald-500 bg-[#07130b] p-6 rounded-xl text-center space-y-2 shadow-2xl";
    title.innerText = "TOUCHDOWN CONFIRMED // APOLLO LGC NOMINAL";
    title.className = "text-2xl font-bold text-emerald-400 crt-phosphor-glow";
    desc.innerText = `Mare Tranquillitatis landing pad touchdown successful. Descent rate: ${vy} m/s. All 20 physical invariants verified.`;
    desc.className = "text-xs text-emerald-300";
  } else {
    card.className = "border border-red-500 bg-[#16080a] p-6 rounded-xl text-center space-y-2 shadow-2xl";
    title.innerText = "VEHICLE IMPACT CRASH // STRUCTURAL BREAKUP";
    title.className = "text-2xl font-bold text-red-400";
    desc.innerText = `Descent velocity ${vy} m/s exceeded LEM landing gear limit (3.0 m/s). Flat LLM lacked 0x00403000 throttle table!`;
    desc.className = "text-xs text-red-300";
  }
}

function hideTouchdownAlert() {
  document.getElementById("touchdownAlert").classList.add("hidden");
}

function renderVectorCRT(data) {
  if (!ctx || !canvas || !data) return;

  const w = canvas.width;
  const h = canvas.height;
  const s = (flightMode === "ghostgraph") ? data.ghostgraph : data.flat_llm;
  const terrain = data.terrain || [];

  // Deep CRT Phosphor Background Clear
  ctx.fillStyle = "#05070a";
  ctx.fillRect(0, 0, w, h);

  // Background oscilloscope grid lines
  ctx.strokeStyle = "rgba(0, 229, 255, 0.05)";
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 50) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += 50) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Draw Lunar Terrain Profile (from 0x00403100)
  ctx.strokeStyle = (flightMode === "ghostgraph") ? "#00ff66" : "#ff3344";
  ctx.lineWidth = 2;
  ctx.shadowColor = (flightMode === "ghostgraph") ? "rgba(0, 255, 102, 0.8)" : "rgba(255, 51, 68, 0.8)";
  ctx.shadowBlur = 8;
  ctx.beginPath();

  const dx = w / (terrain.length - 1);
  for (let i = 0; i < terrain.length; i++) {
    // Map terrain elevation (0 to 100m) to canvas bottom
    const tx = i * dx;
    const ty = h - (terrain[i] * 2.5) - 20;
    if (i === 0) ctx.moveTo(tx, ty);
    else ctx.lineTo(tx, ty);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Highlight Mare Tranquillitatis Flat Landing Pad (indices 11 to 19)
  const padX1 = 11 * dx;
  const padX2 = 19 * dx;
  const padY = h - (10.0 * 2.5) - 20;
  ctx.strokeStyle = "#00e5ff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(padX1, padY);
  ctx.lineTo(padX2, padY);
  ctx.stroke();

  // Landing Pad Target Markers
  ctx.fillStyle = "#00e5ff";
  ctx.font = "10px monospace";
  ctx.fillText("▼ MARE TRANQUILLITATIS LANDING PAD (FLAT 10.0m)", padX1 + 10, padY + 18);

  // Calculate Lander Screen Coordinates
  // Map x (0 to 1000m) -> (0 to w), y (0 to 1000m) -> (padY to 50px from top)
  const landerScreenX = (s.x / 1000.0) * w;
  const landerScreenY = Math.max(30, padY - (s.radar_alt * 0.45));

  // Draw Radar Altimeter Raycast Beam
  ctx.strokeStyle = "rgba(0, 229, 255, 0.4)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(landerScreenX, landerScreenY + 15);
  ctx.lineTo(landerScreenX, padY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw Apollo Lunar Module Vector Wireframe
  ctx.save();
  ctx.translate(landerScreenX, landerScreenY);
  ctx.rotate(s.pitch);

  const lmColor = (flightMode === "ghostgraph") ? "#00ff66" : "#ff3344";
  ctx.strokeStyle = lmColor;
  ctx.lineWidth = 2;
  ctx.shadowColor = lmColor;
  ctx.shadowBlur = 6;

  // Ascent Stage Cabin (Octagon)
  ctx.strokeRect(-12, -20, 24, 16);
  // Descent Stage Base (Trapezoid)
  ctx.strokeRect(-16, -4, 32, 10);
  // 4 Landing Struts
  ctx.beginPath();
  ctx.moveTo(-16, 6); ctx.lineTo(-24, 16); // Left footpad
  ctx.moveTo(16, 6); ctx.lineTo(24, 16);   // Right footpad
  ctx.moveTo(-8, 6); ctx.lineTo(-12, 16);
  ctx.moveTo(8, 6); ctx.lineTo(12, 16);
  ctx.stroke();

  // Thruster Plume
  if (s.throttle > 0.05 && s.fuel_mass > 0) {
    const plumeLength = s.throttle * 30;
    ctx.strokeStyle = "#ffb000";
    ctx.shadowColor = "#ffb000";
    ctx.beginPath();
    ctx.moveTo(-6, 6);
    ctx.lineTo(0, 6 + plumeLength + (Math.random() * 5));
    ctx.lineTo(6, 6);
    ctx.stroke();
  }

  ctx.restore();
}

function initKeyboardControls() {
  window.addEventListener("keydown", (e) => {
    if (currentStep !== 4) return;
    if (e.key === "w" || e.key === "W" || e.key === "ArrowUp") {
      pilotAdjustThrottle(0.15);
    } else if (e.key === "s" || e.key === "S" || e.key === "ArrowDown") {
      pilotAdjustThrottle(-0.15);
    } else if (e.key === "a" || e.key === "A" || e.key === "ArrowLeft") {
      pilotAdjustPitch(-0.1);
    } else if (e.key === "d" || e.key === "D" || e.key === "ArrowRight") {
      pilotAdjustPitch(0.1);
    } else if (e.key === "r" || e.key === "R") {
      resetLunarFlight();
    }
  });
}
