"""
GhostGraph Reconstruction Agent (The Architect).
Uses FalkorDB graph memory to investigate multi-hop caller/callee context,
resolve detached memory offsets, and synthesize clean modern Python/C code
using live Google Gemini 3.1 Flash-Lite inference.

Zero hardcoded fallback templates: all synthesis is performed live via real LLM calls.
"""

import os
import time
import json
import logging
import urllib.request
import urllib.error
from typing import Any, Dict, List, Optional
from backend.mcp_tools.cypher_tools import (
    get_function_context,
    resolve_memory_source,
    get_struct_definition,
    fetch_failure_memory,
    record_candidate
)

logger = logging.getLogger("ghostgraph.reconstruction_agent")

class ReconstructionAgent:
    """Agent that synthesizes clean source code using FalkorDB graph memory and Gemini 3.1 Flash-Lite."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY", "")
        self.active_model = "gemini-3.1-flash-lite"

    def reconstruct_function(
        self,
        function_name: str,
        target_name: str = "binary_target",
        version: int = 1,
        use_graph_context: bool = True,
        target_language: str = "python"
    ) -> Dict[str, Any]:
        """
        Reconstructs a function implementation into clean, runnable source code (Python or C).
        If use_graph_context is True, queries FalkorDB for multi-hop provenance and memory tables.
        If use_graph_context is False, prompts Gemini with only the raw isolated function pseudocode.
        """
        logger.info(f"Reconstructing {function_name} on {target_name} [v{version} | GraphContext: {use_graph_context} | Lang: {target_language}]")

        # 1. Base Function Context from FalkorDB
        context = get_function_context(function_name)
        pseudocode = context.get("pseudocode", "")
        raw_asm = context.get("raw_asm", "")
        callers = context.get("callers", [])
        callees = context.get("callees", [])
        reads = context.get("reads", [])
        writes = context.get("writes", [])

        # 2. Multi-Hop Graph Memory Resolution via FalkorDB
        resolved_memory = []
        struct_info = {}
        failure_memory = []

        if use_graph_context:
            for mem_ref in reads:
                addr = mem_ref.get("address")
                if addr:
                    provenance = resolve_memory_source(addr)
                    if provenance:
                        resolved_memory.extend(provenance)

            # Retrieve any struct definition if available
            struct_name = "GameState" if "space" in target_name.lower() or "invader" in target_name.lower() else "FlightTelemetry"
            struct_info = get_struct_definition(struct_name)

            if version > 1:
                failure_memory = fetch_failure_memory(target_name, version - 1)

        # 3. Live Code Generation via Gemini 3.1 Flash-Lite
        code_input = pseudocode if pseudocode and not pseudocode.startswith("// Function not found") else raw_asm
        prompt = self._build_prompt(
            target_name=target_name,
            function_name=function_name,
            code_input=code_input,
            callers=callers,
            callees=callees,
            resolved_memory=resolved_memory,
            struct_info=struct_info,
            failure_memory=failure_memory,
            use_graph_context=use_graph_context,
            target_language=target_language
        )

        synthesized_code = self._call_gemini_api(self.active_model, prompt)
        if not synthesized_code:
            raise RuntimeError(f"Gemini 3.1 Flash-Lite inference failed to generate code for {function_name}.")

        # 4. Commit candidate to FalkorDB
        candidate_id = record_candidate(
            function_name=function_name,
            source_code=synthesized_code,
            version=version,
            status="SYNTHESIZED"
        )

        return {
            "candidate_id": candidate_id,
            "target_name": target_name,
            "function_name": function_name,
            "version": version,
            "use_graph_context": use_graph_context,
            "resolved_memory_count": len(resolved_memory),
            "recalled_failures_count": len(failure_memory),
            "source_code": synthesized_code,
            "target_language": target_language
        }

    def reconstruct_full_module(
        self,
        program_name: str,
        functions: List[Dict[str, Any]],
        memory_buffers: List[Dict[str, Any]],
        target_language: str = "python"
    ) -> str:
        """
        Synthesizes an entire cohesive software module / game application
        from all disassembled functions and grounded graph memory tables.
        """
        logger.info(f"Synthesizing complete application for '{program_name}' in {target_language} via Gemini 3.1 Flash-Lite...")

        prompt = f"""You are GhostGraph's master reverse engineering architect.
We have disassembled a complete application ('{program_name}') into FalkorDB graph memory.

GLOBAL MEMORY DATA TABLES RESOLVED IN FALKORDB:
{json.dumps(memory_buffers, indent=2)}

DISASSEMBLED SUBROUTINES AND CALL GRAPHS:
{json.dumps([{ 'name': f.get('name'), 'address': f.get('address'), 'callers': f.get('callers'), 'callees': f.get('callees'), 'code': f.get('pseudocode') or f.get('raw_asm') } for f in functions[:25]], indent=2)}

TASK:
Reconstruct this entire application into a single, cohesive, 100% complete, fully runnable {target_language.upper()} program.
Requirements:
1. Preserve the full state machine: Title/Start screen, main execution loop, player controls, enemy/data updates, collisions/validations, and game over/high scores.
2. Bind all raw hexadecimal memory tables to clear, idiomatic data structures (dictionaries, lists, or dataclasses).
3. Output clean, documented, professional {target_language.upper()} code ready to run directly.

Output ONLY the complete code inside a ```{target_language} ``` block."""

        code = self._call_gemini_api(self.active_model, prompt)
        if not code:
            raise RuntimeError(f"Gemini 3.1 Flash-Lite failed to synthesize full module for {program_name}.")
        return code

    def _call_gemini_api(self, model: str, prompt: str) -> Optional[str]:
        """Calls Google Generative Language API via standard HTTPS with timeout."""
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY environment variable is not configured.")

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={self.api_key}"
        payload = json.dumps({
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.1,
                "maxOutputTokens": 4096
            }
        }).encode("utf-8")

        req = urllib.request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST"
        )

        last_error = None
        for attempt in range(2):
            try:
                with urllib.request.urlopen(req, timeout=35) as resp:
                    result = json.loads(resp.read().decode("utf-8"))
                    candidates = result.get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        if parts:
                            text = parts[0].get("text", "")
                            return self._clean_markdown_code(text)
            except urllib.error.HTTPError as e:
                err_body = e.read().decode("utf-8", errors="ignore")
                logger.error(f"Gemini API HTTP {e.code}: {err_body}")
                last_error = RuntimeError(f"Google Generative Language API error ({e.code}): {err_body}")
                if e.code in [429, 500, 503]:
                    time.sleep(2)
                    continue
                raise last_error
            except Exception as e:
                logger.warning(f"Gemini API request attempt {attempt + 1} error: {e}")
                last_error = RuntimeError(f"Network error communicating with Google Generative AI: {e}")
                time.sleep(2)

        if last_error:
            raise last_error
        return None

    def _clean_markdown_code(self, text: str) -> str:
        """Extracts clean source code from markdown code fences."""
        for tag in ["```python", "```c", "```rust", "```"]:
            if tag in text:
                return text.split(tag, 1)[1].split("```", 1)[0].strip()
        return text.strip()

    def _build_prompt(self, **kwargs) -> str:
        """Constructs prompt for Gemini 3.1 Flash-Lite."""
        use_graph = kwargs.get("use_graph_context", True)
        fn = kwargs.get("function_name", "")
        target = kwargs.get("target_name", "")
        code_input = kwargs.get("code_input", "")
        lang = kwargs.get("target_language", "python")

        if not use_graph:
            return f"""You are a binary reverse engineering engine.
Reconstruct the following decompiled/disassembled function '{fn}' from '{target}' into clean, idiomatic modern {lang.upper()}.
You are in ISOLATED FLAT MODE:
- You have NO access to global memory symbols.
- You have NO struct definitions.
- You have NO caller or callee graph context.
Do your best to infer the logic using only this isolated snippet.

Disassembled input:
{code_input}

Output ONLY valid {lang.upper()} code inside a ```{lang} ``` block."""

        return f"""You are GhostGraph's autonomous reverse engineering agent powered by FalkorDB graph memory.
Task: Reconstruct subroutine '{fn}' from '{target}' into clean, idiomatic, fully working modern {lang.upper()}.

FALKORDB TOPOLOGICAL CONTEXT:
- Direct Callers: {kwargs.get('callers')}
- Direct Callees: {kwargs.get('callees')}
- Grounded Global Memory Buffers (Multi-Hop Provenance):
{json.dumps(kwargs.get('resolved_memory'), indent=2)}
- Struct Layout: {json.dumps(kwargs.get('struct_info'), indent=2)}
- Prior Verified Failures: {kwargs.get('failure_memory')}

Disassembled Machine Code / Pseudocode:
{code_input}

Requirements:
1. Replace all raw hexadecimal memory offsets with the grounded symbol names and data tables retrieved from FalkorDB.
2. Maintain exact algorithmic logic, mathematical operations, and state machine transitions.
3. Write clean, readable modern {lang.upper()} code with descriptive variable names and helpful inline comments explaining the reverse-engineered logic.

Output ONLY valid {lang.upper()} code inside a ```{lang} ``` block."""

# Global singleton instance
reconstruction_agent = ReconstructionAgent()
