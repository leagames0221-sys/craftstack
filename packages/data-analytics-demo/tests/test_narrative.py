"""Tests for the narrative layer (T-08 / AC-4.1〜4.5)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from data_analytics_demo.narrative import generate, ollama_client, prompts


@pytest.fixture()
def fake_shap_summary(tmp_path: Path) -> Path:
    """Write a minimal SHAP summary JSON for the narrative pipeline to read."""
    p = tmp_path / "shap_summary.json"
    p.write_text(
        json.dumps(
            {
                "top_features": [
                    {
                        "name": "recent_to_lifetime_ratio",
                        "mean_abs_shap": 0.42,
                        "mean_signed_shap": -0.37,
                        "direction": "decreases_prediction",
                    },
                    {
                        "name": "failed_invoice_count",
                        "mean_abs_shap": 0.18,
                        "mean_signed_shap": 0.15,
                        "direction": "increases_prediction",
                    },
                ],
                "summary": {"n_samples_explained": 200, "n_features": 18, "top_n_returned": 2},
            }
        ),
        encoding="utf-8",
    )
    return p


class _FakeClient:
    """Stand-in for `ollama.Client` — records the call, returns canned text."""

    last_kwargs: dict[str, Any] = {}

    def __init__(self, host: str | None = None) -> None:
        self.host = host

    def chat(self, **kwargs: Any) -> dict[str, Any]:
        _FakeClient.last_kwargs = kwargs
        return {
            "message": {
                "content": (
                    "Customers who slow down their product usage in the trailing month "
                    "are the strongest churn risk. Acting on this signal early protects "
                    "expansion revenue and reduces incident load."
                )
            }
        }


# ---- AC-4.1: WHEN `make narrative` runs, the system produces output.md ------

def test_ac_4_1_produces_output_markdown(
    fake_shap_summary: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    out = tmp_path / "output.md"
    monkeypatch.setattr(ollama_client.ollama, "Client", _FakeClient)
    # Make sure the env-var guard sees no external creds.
    for key in ollama_client.EXTERNAL_API_ENV_VARS:
        monkeypatch.delenv(key, raising=False)

    written = generate.main(shap_path=fake_shap_summary, output_path=out)
    assert written == out
    assert out.exists()
    text = out.read_text(encoding="utf-8")
    assert "Churn-Risk Narrative" in text
    assert "expansion revenue" in text  # body from _FakeClient


# ---- AC-4.2: IF Ollama is unreachable, fail with a remediation hint --------

def test_ac_4_2_unreachable_ollama_clear_error(
    fake_shap_summary: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _BrokenClient:
        def __init__(self, host: str | None = None) -> None:
            self.host = host

        def chat(self, **kwargs: Any) -> Any:
            raise ConnectionError("connection refused")

    monkeypatch.setattr(ollama_client.ollama, "Client", _BrokenClient)
    for key in ollama_client.EXTERNAL_API_ENV_VARS:
        monkeypatch.delenv(key, raising=False)

    with pytest.raises(RuntimeError, match="Cannot reach Ollama"):
        generate.main(shap_path=fake_shap_summary, output_path=tmp_path / "out.md")


# ---- AC-4.3: WHERE LLM is invoked, system shall NOT call any external API --

def test_ac_4_3_external_api_env_blocks_invocation(
    fake_shap_summary: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ANTHROPIC_API_KEY", "leaked-fake-key")
    # Even if the Ollama client would have worked, the guard must trip first.
    monkeypatch.setattr(ollama_client.ollama, "Client", _FakeClient)

    with pytest.raises(RuntimeError, match="External LLM API credentials"):
        generate.main(shap_path=fake_shap_summary, output_path=tmp_path / "out.md")


def test_ac_4_3_assert_no_external_api_envs_unit(monkeypatch: pytest.MonkeyPatch) -> None:
    for key in ollama_client.EXTERNAL_API_ENV_VARS:
        monkeypatch.delenv(key, raising=False)
    # Should not raise.
    ollama_client.assert_no_external_api_envs()


# ---- AC-4.4: output.md cites shap_summary.json + AC-4.5: model id present --

def test_ac_4_4_and_4_5_metadata_block(
    fake_shap_summary: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    out = tmp_path / "output.md"
    monkeypatch.setattr(ollama_client.ollama, "Client", _FakeClient)
    for key in ollama_client.EXTERNAL_API_ENV_VARS:
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("OLLAMA_MODEL", "llama3.1:8b-instruct-q4_K_M")

    generate.main(shap_path=fake_shap_summary, output_path=out)
    text = out.read_text(encoding="utf-8")

    # AC-4.4: cites shap_summary source path
    assert "shap_summary.json" in text
    assert fake_shap_summary.name in text
    # AC-4.5: model identifier present
    assert "llama3.1:8b-instruct-q4_K_M" in text
    # External-call assertion advertised in the metadata
    assert "External LLM calls" in text


# ---- Missing-data path -----------------------------------------------------

def test_missing_shap_summary_raises(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    for key in ollama_client.EXTERNAL_API_ENV_VARS:
        monkeypatch.delenv(key, raising=False)
    with pytest.raises(FileNotFoundError, match="shap_summary.json"):
        generate.main(
            shap_path=tmp_path / "nope.json",
            output_path=tmp_path / "out.md",
        )


# ---- Prompt builder --------------------------------------------------------

def test_build_prompt_includes_features() -> None:
    summary = {
        "top_features": [
            {
                "name": "events_last_30d",
                "mean_abs_shap": 0.55,
                "direction": "increases_prediction",
            }
        ]
    }
    text = prompts.build_prompt(summary)
    assert "events_last_30d" in text
    assert "raises the churn likelihood" in text
