"""LLM narrative layer for the customer-analytics demo.

Public surface:
    generate.main()            Orchestrates SHAP -> Ollama -> markdown.
    ollama_client.generate_narrative()   Thin Ollama wrapper.
    prompts.build_prompt()     SHAP-summary -> prompt string.

All inference runs locally via Ollama (no external LLM API). The module
asserts the absence of cloud-LLM credentials in `os.environ` at invocation
time (AC-4.3).
"""
