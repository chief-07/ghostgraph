"""
Tests for Problem 10: HMAC-SHA256 Signed Verification Certificates & Verification Authority.
Verifies cryptographic integrity, anti-tampering defenses, and signature validation endpoint.
"""

import time
import pytest
from starlette.testclient import TestClient
from backend.app import app, generate_verification_signature, SIGNING_AUTHORITY_SECRET


@pytest.fixture
def client():
    return TestClient(app)


def test_hmac_sha256_signature_generation_and_tamper_detection():
    """
    Problem 10: Verifies that generate_verification_signature computes an authentic
    HMAC-SHA256 signature and that any payload modification is mathematically caught.
    """
    target_id = "billing"
    candidate_id = "cand_compute_progressive_tax_v1"
    version = 1
    status = "VERIFIED_MATHEMATICAL_PARITY"
    parity = 100.0
    passed_tests = 20
    total_tests = 20
    source_code = "def compute_progressive_tax(income): return income * 0.10"
    ts = time.time()

    cert_id, digest, sig = generate_verification_signature(
        target_id=target_id,
        candidate_id=candidate_id,
        version=version,
        status=status,
        parity=parity,
        passed_tests=passed_tests,
        total_tests=total_tests,
        source_code=source_code,
        timestamp=ts
    )

    assert cert_id.startswith("CERT-SIG-")
    assert len(digest) == 64  # SHA-256 is 64 hex characters
    assert len(sig) == 64     # HMAC-SHA256 is 64 hex characters

    # Tamper with parity: change from 100.0 to 99.9 -> digest & signature MUST change
    _, tampered_digest, tampered_sig = generate_verification_signature(
        target_id=target_id,
        candidate_id=candidate_id,
        version=version,
        status=status,
        parity=99.9,
        passed_tests=passed_tests,
        total_tests=total_tests,
        source_code=source_code,
        timestamp=ts
    )
    assert tampered_digest != digest
    assert tampered_sig != sig

    # Tamper with source code -> signature MUST change
    _, tampered_src_digest, tampered_src_sig = generate_verification_signature(
        target_id=target_id,
        candidate_id=candidate_id,
        version=version,
        status=status,
        parity=parity,
        passed_tests=passed_tests,
        total_tests=total_tests,
        source_code="def compute_progressive_tax(income): return 0.0",
        timestamp=ts
    )
    assert tampered_src_digest != digest
    assert tampered_src_sig != sig


def test_verify_certificate_endpoint_valid(client):
    """Verifies that an authentic certificate returns valid=True from /api/verify-certificate."""
    ts = time.time()
    source_code = "def compute_progressive_tax(x): return x"
    cert_id, digest, sig = generate_verification_signature(
        target_id="billing",
        candidate_id="cand_v1",
        version=1,
        status="VERIFIED_MATHEMATICAL_PARITY",
        parity=100.0,
        passed_tests=20,
        total_tests=20,
        source_code=source_code,
        timestamp=ts
    )

    payload = {
        "certificate_id": cert_id,
        "target_id": "billing",
        "candidate_id": "cand_v1",
        "candidate_version": 1,
        "status": "VERIFIED_MATHEMATICAL_PARITY",
        "parity_percentage": 100.0,
        "test_vectors_passed": 20,
        "test_vectors_total": 20,
        "source_code": source_code,
        "timestamp": ts,
        "cryptographic_signature": sig
    }

    resp = client.post("/api/verify-certificate", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["valid"] is True
    assert data["status"] == "VALID_CRYPTOGRAPHIC_SIGNATURE"
    assert data["expected_signature"] == sig


def test_verify_certificate_endpoint_tampered_fails(client):
    """
    Problem 10 Security: An attacker tampering with parity percentage
    (e.g. forging 100.0% when real tests only achieved 30.0%) is immediately rejected.
    """
    ts = time.time()
    source_code = "def broken(x): return 0"
    # Authentic signature generated for 30.0% parity
    cert_id, digest, real_sig_at_30 = generate_verification_signature(
        target_id="billing",
        candidate_id="cand_broken_v1",
        version=1,
        status="PARITY_MISMATCH",
        parity=30.0,
        passed_tests=6,
        total_tests=20,
        source_code=source_code,
        timestamp=ts
    )

    # Attacker crafts forged payload claiming 100.0% but with real_sig_at_30
    forged_payload = {
        "certificate_id": cert_id,
        "target_id": "billing",
        "candidate_id": "cand_broken_v1",
        "candidate_version": 1,
        "status": "VERIFIED_MATHEMATICAL_PARITY",
        "parity_percentage": 100.0,  # FORGED!
        "test_vectors_passed": 20,    # FORGED!
        "test_vectors_total": 20,
        "source_code": source_code,
        "timestamp": ts,
        "cryptographic_signature": real_sig_at_30
    }

    resp = client.post("/api/verify-certificate", json=forged_payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["valid"] is False
    assert data["status"] == "INVALID_SIGNATURE_TAMPERED"
