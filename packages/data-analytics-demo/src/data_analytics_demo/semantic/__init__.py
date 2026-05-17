"""Semantic-layer validator for `semantic/kpi.yml`.

Checks the MetricFlow-compatible KPI definition file against AC-6.1 and
AC-6.2 (each metric has ≥ 1 dimension and ≥ 1 measure). Independent of
the MetricFlow CLI so the test suite has no CLI-shell dependency.
"""
