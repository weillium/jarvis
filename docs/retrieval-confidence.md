# Retrieval Confidence

Formula: `score = w1*fts_rank_norm + w2*vec_score + w3*entity_overlap + w4*topic_alignment`

Default Weights:
- w1 = 0.4
- w2 = 0.35
- w3 = 0.15
- w4 = 0.10

Thresholds:
- Compose locally: **score ≥ 0.75**
- Try web fallback: **0.45 ≤ score < 0.75**
