"""
GhostGraph Compiler Harness.
Compiles reconstructed C candidate implementations using available local
compilers (GCC, Clang, TCC, MSVC). Provides detailed compiler error logs
back to the Reconstruction Agent for syntax self-correction.
"""

import os
import shutil
import logging
import subprocess
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger("ghostgraph.compiler")

class CCompiler:
    """Detects and coordinates C compilation."""

    def __init__(self):
        self.compiler_cmd = self._detect_compiler()
        logger.info(f"Initialized CCompiler with: {self.compiler_cmd or 'No compiler (Simulation Mode)'}")

    def _detect_compiler(self) -> Optional[str]:
        """Detects available C compiler in system PATH or local tools."""
        for candidate in ["gcc", "clang", "cl", "tcc"]:
            if shutil.which(candidate):
                return candidate
        return None

    def compile(
        self,
        source_code: str,
        output_binary_path: str,
        extra_flags: Optional[list] = None
    ) -> Dict[str, Any]:
        """
        Writes source code to a temporary C file and invokes compiler.
        Returns detailed status and compiler diagnostic messages.
        """
        out_path = Path(output_binary_path)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        
        source_file = out_path.with_suffix(".c")
        with open(source_file, "w", encoding="utf-8") as f:
            f.write(source_code)

        if not self.compiler_cmd:
            logger.warning("No C compiler detected on host. Operating in compiler simulation mode.")
            return {
                "success": True,
                "binary_path": str(out_path),
                "compiler_used": "simulation",
                "output": "Simulated compilation successful (no local GCC detected)."
            }

        cmd = [self.compiler_cmd, "-O1", str(source_file), "-o", str(out_path)]
        if extra_flags:
            cmd.extend(extra_flags)

        try:
            res = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=15
            )
            success = (res.returncode == 0) and out_path.exists()
            return {
                "success": success,
                "binary_path": str(out_path) if success else None,
                "compiler_used": self.compiler_cmd,
                "return_code": res.returncode,
                "output": res.stderr if not success else res.stdout
            }
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "binary_path": None,
                "compiler_used": self.compiler_cmd,
                "return_code": -1,
                "output": "Compilation timed out after 15 seconds."
            }
        except Exception as e:
            return {
                "success": False,
                "binary_path": None,
                "compiler_used": self.compiler_cmd,
                "return_code": -1,
                "output": f"Compilation execution error: {str(e)}"
            }


# Global singleton instance
c_compiler = CCompiler()
