"""Narrative generator entry point — reads SHAP summary, calls Ollama, writes markdown.

Glue between the ML layer (SHAP JSON output) and the executive-facing
output. Implements AC-4.1 through AC-4.5 in a single linear flow.
"""

from __future__ import annotations

import json
import sys
from datetime import UTC, datetime
from pathlib import Path

from .. import __version__
from ..ml import _io
from . import ollama_client, prompts


def _emit(msg: str) -> None:
    print(f"[narrative] {msg}", file=sys.stderr, flush=True)  # noqa: T201


def _default_shap_path() -> Path:
    return _io.default_artifacts_dir() / "shap_summary.json"


def _default_output_path() -> Path:
    return _io.package_root() / "narrative" / "output.md"


def _render(
    *,
    body: str,
    model_id: str,
    host: str,
    shap_path: Path,
    feature_count: int,
) -> str:
    """Wrap the LLM body with provenance + reproducibility metadata.

    The metadata block satisfies AC-4.4 (citation back to SHAP JSON) and
    AC-4.5 (model identifier present in the artifact).
    """
    timestamp = datetime.now(UTC).isoformat(timespec="seconds")
    return (
        "# Churn-Risk Narrative (Auto-generated)\n"
        "\n"
        "> **Model**: local Ollama — `"
        f"{model_id}` via `{host}`.\n"
        "> "
        f"**Source**: SHAP feature importances at `{shap_path.as_posix()}` "
        f"({feature_count} features ranked).\n"
        f"> **Generated**: {timestamp} by `data-analytics-demo` v{__version__}.\n"
        "> **External LLM calls**: 0 (assertion-enforced; see "
        "`narrative/ollama_client.py::assert_no_external_api_envs`).\n"
        "\n"
        f"{body.strip()}\n"
        "\n"
        "---\n"
        "*Auto-generated. Do not edit by hand — re-run `make narrative` to refresh.*\n"
    )


def main(
    *,
    shap_path: Path | None = None,
    output_path: Path | None = None,
) -> Path:
    """Run the full narrative pipeline and return the output file path."""
    # AC-4.3 — assert clean env before any LLM call.
    ollama_client.assert_no_external_api_envs()

    shap_in = shap_path or _default_shap_path()
    if not shap_in.exists():
        raise FileNotFoundError(
            f"shap_summary.json not found at {shap_in}. "
            "Run `make ml` to produce it before `make narrative`."
        )

    out_path = output_path or _default_output_path()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    _emit(f"loading SHAP summary from {shap_in.name}")
    summary = json.loads(shap_in.read_text(encoding="utf-8"))
    feature_count = len(summary.get("top_features", []))

    prompt = prompts.build_prompt(summary)
    _emit(
        f"calling Ollama at {ollama_client.resolved_host()} "
        f"(model={ollama_client.resolved_model()})"
    )
    body = ollama_client.generate_narrative(prompt)

    rendered = _render(
        body=body,
        model_id=ollama_client.resolved_model(),
        host=ollama_client.resolved_host(),
        shap_path=shap_in,
        feature_count=feature_count,
    )
    out_path.write_text(rendered, encoding="utf-8")
    _emit(f"wrote {out_path}")
    return out_path


if __name__ == "__main__":
    main()
