# L3: Feature Engineering

> Reference layer for feature computation, storage, and serving.

---

## 3.1 Feature Store Architecture

| Component | Purpose | Technology |
|-----------|---------|-----------|
| Registry | Central catalogue of definitions, metadata, ownership | Feast / Tecton / Hopsworks |
| Offline Store | Historical values for training | Delta Lake / Iceberg / BigQuery |
| Online Store | Low-latency serving (<10ms) | Redis / DynamoDB / Bigtable |
| Computation | Batch + streaming transforms | Spark / Flink / dbt |
| Serving API | Unified feature fetch at inference | Feast serving / custom gRPC |

**Decision: Build vs Buy**
- <50 models: Use Feast (open-source) + Redis
- 50-200 models: Evaluate Tecton or Hopsworks
- 200+ models: Custom-built (Uber Michelangelo pattern)

---

## 3.2 Computation Patterns

| Pattern | Latency | Example | Engine |
|---------|---------|---------|--------|
| Batch | Hours | User LTV, 30-day counts | Spark on schedule |
| Streaming | Seconds | Rolling 5-min txn count | Flink / Spark SS |
| On-Demand | Milliseconds | Current cart total | Computed at inference |
| Embedding | Minutes | User/product embeddings | GPU batch → vector store |

---

## 3.3 Training-Serving Skew Prevention

The #1 cause of silent model degradation. Features computed differently in training vs inference.

**Solution**: Single feature definition used by both:

```python
# feature_definitions.py — shared between training and serving
from feast import Feature, FeatureView, Entity, ValueType

user = Entity(name="user_id", value_type=ValueType.INT64)

user_features = FeatureView(
    name="user_features",
    entities=[user],
    features=[
        Feature(name="total_purchases_30d", dtype=ValueType.INT64),
        Feature(name="avg_session_duration", dtype=ValueType.FLOAT),
        Feature(name="last_login_days_ago", dtype=ValueType.INT64),
    ],
    online=True,
    source=spark_source,  # batch computation
    ttl=timedelta(days=1),
)
```

---

## Audit Checklist

- [ ] Features are defined in code (not ad-hoc in notebooks)
- [ ] Same feature logic used in training and inference
- [ ] Feature documentation exists
- [ ] Point-in-time correctness for training data (no data leakage)
- [ ] Feature freshness monitored
- [ ] Feature drift detection in place
