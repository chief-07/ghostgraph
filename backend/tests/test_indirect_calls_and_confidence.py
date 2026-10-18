import sys
import os
import struct
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.agents.topology_agent import TopologyAgent, SUPPORTED_BINARY_ARCHITECTURES
from backend.mcp_tools.falkor_client import falkor_client
from backend.mcp_tools.cypher_tools import get_function_context, get_indirect_calls

def test_supported_binary_architectures_constant():
    """Verify supported architectures are strictly scoped to x86_64 ELF64 and PE32+."""
    assert "x86_64 ELF64 (Linux)" in SUPPORTED_BINARY_ARCHITECTURES
    assert "x86_64 PE32+ (Windows)" in SUPPORTED_BINARY_ARCHITECTURES

def test_architecture_validation_rejects_32bit_elf():
    """Verify that a 32-bit ELF (ELFCLASS32) is explicitly rejected with ValueError."""
    agent = TopologyAgent()
    # Construct a minimal 32-bit ELF header: \x7fELF + class=1 (32-bit)
    elf32_data = b"\x7fELF\x01\x01\x01\x00" + b"\x00" * 46
    with pytest.raises(ValueError) as excinfo:
        agent.ingest_binary(elf32_data, program_name="test_elf32", target_id="test_arch_elf32")
    assert "Unsupported binary architecture" in str(excinfo.value)
    assert "not 64-bit (ELFCLASS64)" in str(excinfo.value)

def test_architecture_validation_rejects_non_x86_elf():
    """Verify that an ARM64/ARM32 ELF (e_machine != 62) is explicitly rejected with ValueError."""
    agent = TopologyAgent()
    # Construct a 64-bit ELF with e_machine = 40 (ARM32) or 183 (AArch64)
    # offset 18 is e_machine (uint16)
    elf_arm = bytearray(b"\x7fELF\x02\x01\x01\x00" + b"\x00" * 46)
    struct.pack_into("<H", elf_arm, 18, 183)  # 183 = EM_AARCH64
    with pytest.raises(ValueError) as excinfo:
        agent.ingest_binary(bytes(elf_arm), program_name="test_elf_arm", target_id="test_arch_arm")
    assert "Unsupported binary architecture" in str(excinfo.value)
    assert "machine type 183 is not x86_64" in str(excinfo.value)

def test_architecture_validation_rejects_32bit_pe():
    """Verify that a 32-bit PE (IMAGE_FILE_MACHINE_I386 = 0x14C) is rejected."""
    agent = TopologyAgent()
    # Create minimal MZ DOS header pointing to PE header
    dos_header = bytearray(64)
    dos_header[0:2] = b"MZ"
    struct.pack_into("<I", dos_header, 60, 64)  # e_lfanew = 64
    # PE signature + COFF header
    pe_header = bytearray(24)
    pe_header[0:4] = b"PE\x00\x00"
    struct.pack_into("<H", pe_header, 4, 0x014C)  # Machine = i386 (0x14c)
    pe_data = bytes(dos_header + pe_header + b"\x00" * 200)

    with pytest.raises(ValueError) as excinfo:
        agent.ingest_binary(pe_data, program_name="test_pe32", target_id="test_arch_pe32")
    assert "Unsupported binary architecture" in str(excinfo.value)
    assert "not PE32+ / AMD64" in str(excinfo.value)

def test_indirect_calls_and_speculative_edges():
    """
    Assemble x86_64 instructions containing:
    1. Direct call (call +0x10)
    2. Indirect register call (call rax: 0xFF 0xD0)
    3. Indirect memory call (call [rip + 0x10]: 0xFF 0x15 0x10 0x00 0x00 0x00)
    4. Function return (ret: 0xC3)
    Verify that indirect calls generate SpeculativeTarget nodes and [:INDIRECT_CALL] edges.
    """
    agent = TopologyAgent()
    target_id = "test_indirect_calls_graph"

    # x86_64 machine code:
    # 0x401000: call sub_401015 (E8 10 00 00 00) -> direct call to 0x401015
    # 0x401005: mov rax, 0x401020 (48 B8 20 10 40 00 00 00 00 00)
    # 0x40100F: call rax (FF D0) -> indirect register call!
    # 0x401011: call qword ptr [rip + 0x20] (FF 15 20 00 00 00) -> indirect memory call!
    # 0x401017: ret (C3)
    # 0x401018: nop, nop...
    code = (
        b"\xe8\x10\x00\x00\x00"              # call 0x401015 (direct)
        b"\x48\xb8\x20\x10\x40\x00\x00\x00\x00\x00" # mov rax, 0x401020
        b"\xff\xd0"                          # call rax (indirect)
        b"\xff\x15\x20\x00\x00\x00"          # call [rip + 0x20] (indirect)
        b"\xc3"                              # ret
        b"\x90\x90\x90"                      # nop padding
        b"\x48\x31\xc0\xc3"                  # sub_401015: xor rax, rax; ret (callee)
    )

    summary = agent.ingest_binary(
        binary_data=code,
        program_name="indirect_call_sample",
        base_address=0x00401000,
        target_id=target_id
    )

    assert summary["status"] == "INGESTED"
    assert summary["indirect_call_edges_count"] >= 2
    assert len(summary["indirect_calls"]) >= 2

    # Check indirect call target specifiers
    specifiers = {ic["target_specifier"] for ic in summary["indirect_calls"]}
    assert "rax" in specifiers
    assert any("rip" in s for s in specifiers)

    # Check speculative edge properties
    for ic in summary["indirect_calls"]:
        assert ic["speculative"] is True
        assert ic["confidence"] == 0.65
        assert ic["caller"] == "main_entry"

    # Query via cypher tool get_indirect_calls
    indirect_records = get_indirect_calls(graph_name=falkor_client.get_isolated_graph_name(target_id))
    assert len(indirect_records) >= 2
    assert all(r["speculative"] is True for r in indirect_records)
    assert all(r["confidence"] == 0.65 for r in indirect_records)

def test_confidence_scoring_direct_vs_linear_sweep():
    """
    Verify that:
    1. Direct entry points and call targets receive confidence = 1.0.
    2. Linear sweep heuristic functions (unreferenced code following a ret) receive confidence = 0.70.
    """
    agent = TopologyAgent()
    target_id = "test_confidence_graph"

    # 0x401000: main_entry (entrypoint -> conf 1.0)
    #   xor rax, rax (48 31 c0)
    #   call 0x401010 (e8 08 00 00 00 -> direct call to 0x401010, conf 1.0)
    #   ret (c3)
    # 0x401009: nop padding (90 90 90 90 90 90 90)
    # 0x401010: sub_401010 (targeted by call -> conf 1.0)
    #   mov rdx, 1 (48 c7 c2 01 00 00 00)
    #   ret (c3)
    # 0x401018: unreferenced heuristic function (linear sweep following ret -> conf 0.70)
    #   push rbp (55)
    #   mov rbp, rsp (48 89 e5)
    #   ret (c3)
    code = (
        b"\x48\x31\xc0"                      # 0x401000: xor rax, rax
        b"\xe8\x08\x00\x00\x00"              # 0x401003: call 0x401010
        b"\xc3"                              # 0x401008: ret
        b"\x90\x90\x90\x90\x90\x90\x90"      # 0x401009..0x40100F: nops
        b"\x48\xc7\xc2\x01\x00\x00\x00"      # 0x401010: mov rdx, 1
        b"\xc3"                              # 0x401017: ret
        b"\x55\x48\x89\xe5\xc3"              # 0x401018: push rbp; mov rbp, rsp; ret
    )

    summary = agent.ingest_binary(
        binary_data=code,
        program_name="confidence_sample",
        base_address=0x00401000,
        target_id=target_id
    )

    assert summary["status"] == "INGESTED"
    assert summary["functions_count"] >= 3

    # Check function contexts
    graph_name = falkor_client.get_isolated_graph_name(target_id)
    main_ctx = get_function_context("main_entry", graph_name=graph_name)
    assert main_ctx["confidence"] == 1.0

    callee_ctx = get_function_context("sub_00401010", graph_name=graph_name)
    assert callee_ctx["confidence"] == 1.0

    heuristic_ctx = get_function_context("sub_00401018", graph_name=graph_name)
    assert heuristic_ctx["confidence"] == 0.70

def test_cytoscape_topology_export_includes_speculative_targets():
    """Verify that get_topology_graph() exports SpeculativeTarget nodes and INDIRECT_CALL edges."""
    agent = TopologyAgent()
    target_id = "test_cytoscape_speculative"

    code = (
        b"\xff\xd0"  # call rax (indirect)
        b"\xc3"      # ret
    )

    agent.ingest_binary(
        binary_data=code,
        program_name="speculative_cytoscape",
        base_address=0x00401000,
        target_id=target_id
    )

    graph = agent.get_topology_graph()
    assert "nodes" in graph
    assert "edges" in graph

    speculative_nodes = [
        n for n in graph["nodes"]
        if n["data"].get("group") == "SpeculativeTarget" or "Speculative" in n["data"].get("label", "")
    ]
    assert len(speculative_nodes) >= 1
    assert any("rax" in n["data"].get("label", "") for n in speculative_nodes)

    indirect_edges = [e for e in graph["edges"] if e["data"].get("label") == "INDIRECT_CALL"]
    assert len(indirect_edges) >= 1
    assert indirect_edges[0]["data"].get("properties", {}).get("speculative") is True
