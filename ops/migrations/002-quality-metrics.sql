-- quality_metrics: Per-product quality tracking for drift detection

CREATE TABLE IF NOT EXISTS quality_metrics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  product text NOT NULL,
  order_id text,
  grade text,
  score numeric,
  factors jsonb DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_quality_product_date ON quality_metrics(product, created_at DESC);
