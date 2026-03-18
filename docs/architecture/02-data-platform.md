# L2: Data Platform Architecture

> Reference layer for data ingestion, storage, processing, quality, and cataloguing.

---

## 2.1 Lakehouse Architecture

The industry standard for AI data platforms. Combines data lake flexibility with warehouse reliability.

| Component | Technology | Purpose | Decision Factors |
|-----------|-----------|---------|-----------------|
| Object Storage | S3 / GCS / ADLS | Raw + processed data | Cost, lifecycle policies, replication |
| Table Format | Delta Lake / Iceberg | ACID, time travel, schema evolution | Iceberg=vendor-neutral; Delta=Databricks |
| Query Engine | Spark / Trino / DuckDB | Processing and analytics | Spark=batch; Trino=interactive; DuckDB=local |
| Catalog | Unity / Glue / OpenMetadata | Schema, lineage, access control | Vendor lock-in tolerance |
| Orchestration | Airflow / Dagster / Prefect | Scheduling, dependencies, retries | Dagster=asset-centric; Airflow=ecosystem |
| Streaming | Kafka + Flink / Spark SS | Real-time ingestion | Flink=low-latency; Spark SS=unified |

---

## 2.2 Medallion Architecture (Bronze → Silver → Gold)

```
Raw Sources → [Bronze: Raw] → [Silver: Cleansed] → [Gold: Business-Ready]
                append-only     deduplicated          aggregated
                schema-on-read  quality-checked       optimised views
                full history    ML features read here  dashboards
```

**Bronze**: Raw data as ingested. No transforms. Append-only. Source of truth for reprocessing.
**Silver**: Deduplicated, typed, null-handled, joined. Quality checks applied. ML features read from here.
**Gold**: Aggregated, business logic applied. Materialised views for dashboards and low-latency serving.

---

## 2.3 Ingestion Patterns

| Pattern | Use Case | Architecture | Latency |
|---------|----------|-------------|---------|
| Batch ETL | Daily retraining, analytics | Airflow → Spark → Delta/Iceberg | Hours |
| Micro-batch | Near-real-time features | Kafka → Spark SS → Feature Store | Seconds-minutes |
| Real-time | Fraud detection, live recs | Kafka → Flink → Redis | Milliseconds |
| CDC | DB replication to lake | Debezium → Kafka → Iceberg | Seconds |
| API Ingestion | Third-party SaaS data | Airbyte / Fivetran → Landing Zone | Minutes-hours |

---

## 2.4 Data Quality Framework

| Dimension | Checks | Tool | On Failure |
|-----------|--------|------|-----------|
| Completeness | Null rates, column coverage | Great Expectations / dbt | Block pipeline |
| Freshness | Staleness, SLA breaches | Monte Carlo / Soda | Fallback to cache |
| Consistency | Cross-source agreement | dbt tests + custom | Quarantine records |
| Drift | Distribution shift vs baseline | Evidently / custom PSI | Trigger retraining |
| Schema | Column types, new/dropped | Great Expectations | Block ingestion |
| Volume | Row count anomalies | Custom checks | Investigate source |

### Implementation Pattern

```python
# data_quality.py — example with Great Expectations
import great_expectations as gx

def validate_training_data(df, expectation_suite="training_data"):
    context = gx.get_context()
    validator = context.sources.pandas_default.read_dataframe(df)

    # Completeness
    validator.expect_column_values_to_not_be_null("user_id")
    validator.expect_column_values_to_not_be_null("target")

    # Schema
    validator.expect_column_values_to_be_of_type("user_id", "int64")
    validator.expect_column_values_to_be_between("target", 0, 1)

    # Volume
    validator.expect_table_row_count_to_be_between(min_value=1000)

    result = validator.validate()
    if not result.success:
        raise DataQualityError(f"Validation failed: {result.statistics}")
    return result
```

---

## Audit Checklist

- [ ] Clear data storage strategy (where does each type of data live?)
- [ ] Data quality checks exist and run automatically
- [ ] Schema versioning or migration strategy
- [ ] Data cataloguing or documentation of all datasets
- [ ] Backup and recovery plan
- [ ] Data retention policies defined
- [ ] PII handling documented (masking, encryption, deletion)
- [ ] Data lineage trackable (can you trace a prediction back to source data?)
