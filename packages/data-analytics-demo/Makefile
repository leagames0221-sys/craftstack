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
	@echo "  dashboard          Render static-HTML dashboard into dashboard/build/"
	@echo "  semantic-validate  Validate MetricFlow KPI definitions"
	@echo "  demo               Run full pipeline: data → dbt → ml → narrative → dashboard → semantic"
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

# `make demo` chains every stage. Banners make stage boundaries visible
# in the log so a failing stage is easy to locate. Sub-makes run
# sequentially within a single recipe; `set -e` semantics propagate
# through, so any non-zero exit halts the chain (AC-α.2).
demo:
	@printf "\n========== [demo 1/6] data ==========\n"
	@$(MAKE) data
	@printf "\n========== [demo 2/6] dbt ==========\n"
	@$(MAKE) dbt
	@printf "\n========== [demo 3/6] ml ==========\n"
	@$(MAKE) ml
	@printf "\n========== [demo 4/6] narrative ==========\n"
	@$(MAKE) narrative
	@printf "\n========== [demo 5/6] dashboard ==========\n"
	@$(MAKE) dashboard
	@printf "\n========== [demo 6/6] semantic-validate ==========\n"
	@$(MAKE) semantic-validate
	@printf "\n========== [demo] full pipeline OK ==========\n"

test:
	$(PYTHON) -m pytest

lint:
	$(PYTHON) -m ruff check src tests
	$(PYTHON) -m mypy -p data_analytics_demo

clean:
	rm -rf warehouse/*.duckdb ml/artifacts/* dashboard/build narrative/output.md
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
