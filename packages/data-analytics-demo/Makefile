.PHONY: help install data dbt ml narrative dashboard semantic-validate demo test lint clean

PYTHON ?= python
PIP ?= pip

help:
	@echo "Targets:"
	@echo "  install            Install Python deps (editable) + dev extras"
	@echo "  data               Generate synthetic SaaS data into warehouse/analytics.duckdb"
	@echo "  dbt                Run dbt project (staging → intermediate → marts)"
	@echo "  ml                 Train churn + upsell models, save artifacts + SHAP summary"
	@echo "  narrative          Generate LLM narrative from SHAP via local Ollama"
	@echo "  dashboard          Build Evidence static dashboard"
	@echo "  semantic-validate  Validate MetricFlow KPI definitions"
	@echo "  demo               Run full pipeline: data → dbt → ml → narrative → dashboard"
	@echo "  test               Run pytest with coverage"
	@echo "  lint               Run ruff check + mypy --strict"
	@echo "  clean              Remove generated artifacts"

install:
	$(PIP) install -e ".[dev]"

# Stage targets — placeholders until T-03 .. T-10 are implemented
data:
	@echo "[data] TODO T-03: synthetic data generation not yet implemented"
	@exit 1

dbt:
	@echo "[dbt] TODO T-04/T-05: dbt models not yet implemented"
	@exit 1

ml:
	@echo "[ml] TODO T-06/T-07: ML pipelines not yet implemented"
	@exit 1

narrative:
	@echo "[narrative] TODO T-08: Ollama narrative not yet implemented"
	@exit 1

dashboard:
	@echo "[dashboard] TODO T-09: Evidence dashboard not yet implemented"
	@exit 1

semantic-validate:
	@echo "[semantic-validate] TODO T-10: MetricFlow validation not yet implemented"
	@exit 1

demo: data dbt ml narrative dashboard
	@echo "[demo] full pipeline OK"

test:
	$(PYTHON) -m pytest

lint:
	$(PYTHON) -m ruff check src tests
	$(PYTHON) -m mypy src

clean:
	rm -rf warehouse/*.duckdb ml/artifacts/* dashboard/build narrative/output.md
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
