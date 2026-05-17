"""Thin wrapper around the local Ollama HTTP API.

Two responsibilities:
1. `assert_no_external_api_envs` — enforce AC-4.3 at runtime; raises if any
   cloud-LLM credential is present in the environment.
2. `generate_narrative` — call the local Ollama daemon and return the text.

The wrapper is intentionally small: the heavy lifting (transport, JSON
shape) is delegated to the `ollama` Python client, which is the official
maintainer's SDK.
"""

from __future__ import annotations

import os
from typing import Final

import ollama

DEFAULT_HOST: Final[str] = "http://localhost:11434"
DEFAULT_MODEL: Final[str] = "llama3.1:8b-instruct-q4_K_M"

# Env vars that, if set, indicate the caller has set up a cloud LLM
# credential. Their mere presence triggers an AC-4.3 fail-stop.
EXTERNAL_API_ENV_VARS: Final[tuple[str, ...]] = (
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "AZURE_OPENAI_API_KEY",
    "COHERE_API_KEY",
)


def resolved_host() -> str:
    return os.environ.get("OLLAMA_HOST", DEFAULT_HOST)


def resolved_model() -> str:
    return os.environ.get("OLLAMA_MODEL", DEFAULT_MODEL)


def assert_no_external_api_envs() -> None:
    """AC-4.3 — fail fast if any cloud-LLM credential leaked into env."""
    leaked = [k for k in EXTERNAL_API_ENV_VARS if os.environ.get(k)]
    if leaked:
        msg = (
            "External LLM API credentials detected in environment: "
            f"{leaked}. This package routes all inference through local "
            "Ollama. Unset these variables or use a clean shell before "
            "running `make narrative`."
        )
        raise RuntimeError(msg)


def generate_narrative(
    prompt: str,
    *,
    model: str | None = None,
    host: str | None = None,
    temperature: float = 0.4,
) -> str:
    """Send `prompt` to local Ollama and return the response text.

    Raises a clear RuntimeError (with remediation hint) if Ollama is not
    reachable, satisfying AC-4.2.
    """
    use_host = host or resolved_host()
    use_model = model or resolved_model()

    try:
        client = ollama.Client(host=use_host)
        response = client.chat(
            model=use_model,
            messages=[{"role": "user", "content": prompt}],
            options={"temperature": temperature},
        )
    except ConnectionError as exc:
        raise RuntimeError(
            f"Cannot reach Ollama at {use_host}. Run `ollama serve` and "
            f"ensure model `{use_model}` is pulled (`ollama pull {use_model}`)."
        ) from exc
    except Exception as exc:  # noqa: BLE001
        # ollama-py wraps transport errors in its own exception classes;
        # surface them with the same remediation hint.
        msg = str(exc).lower()
        if "connect" in msg or "refused" in msg or "timeout" in msg:
            raise RuntimeError(
                f"Cannot reach Ollama at {use_host}. Run `ollama serve` and "
                f"ensure model `{use_model}` is pulled (`ollama pull {use_model}`)."
            ) from exc
        raise

    return str(response["message"]["content"])
