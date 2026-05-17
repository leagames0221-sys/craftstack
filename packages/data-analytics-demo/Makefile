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

# Stage targets
data:
	$(PYTHON) -m data_analytics_demo.data.generate

dbt:
	cd dbt_project && DBT_PROFILES_DIR=. dbt run
	cd dbt_project && DBT_PROFILES_DIR=. dbt test

ml:
	$(PYTHON) -m data_analytics_demo.ml.churn
	$(PYTHON) -m data_analytics_demo.ml.upsell

narrative:
	$(PYTHON) -m data_analytics_demo.narrative.generate

dashboard:
	$(PYTHON) -m data_analytics_demo.dashboard.render

semantic-validate:
	$(PYTHON) -m data_analytics_demo.semantic.validator

demo: data dbt ml narrative dashboard
	@echo "[demo] full pipeline OK"

test:
	$(PYTHON) -m pytest

lint:
	$(PYTHON) -m ruff check src tests
	$(PYTHON) -m mypy -p data_analytics_demo

clean:
	rm -rf warehouse/*.duckdb ml/artifacts/* dashboard/build narrative/output.md
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
