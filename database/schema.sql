-- ============================================================
-- ScrappyAI — Supabase Veritabanı (tek dosya)
-- Supabase SQL Editor'da bir kez çalıştırın.
-- Yeni kurulumda tabloları oluşturur; mevcut DB'yi günceller.
-- ============================================================

-- Temiz başlangıç (isteğe bağlı — DİKKAT: tüm veriyi siler):
-- DROP TABLE IF EXISTS reviews;
-- DROP TABLE IF EXISTS apps_analysis;

-- ------------------------------------------------------------
-- 1. Tablolar
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS apps_analysis (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  app_id TEXT NOT NULL,
  app_name TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  logo_url TEXT,
  total_reviews_scraped INTEGER DEFAULT 0,
  sentiment_distribution JSONB,
  ai_summary TEXT,
  ai_positives JSONB,
  ai_negatives JSONB,
  ai_bugs JSONB,
  ai_features JSONB,
  status TEXT NOT NULL DEFAULT 'scraped',
  analysis_progress JSONB,
  analysis_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  analysis_id UUID REFERENCES apps_analysis(id) ON DELETE CASCADE NOT NULL,
  store_review_id TEXT,
  user_name TEXT,
  rating INTEGER CHECK (rating >= 0 AND rating <= 5),
  comment TEXT,
  date TIMESTAMP WITH TIME ZONE,
  sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ------------------------------------------------------------
-- 2. Mevcut DB güncellemeleri (eksik kolon / constraint)
-- ------------------------------------------------------------

ALTER TABLE apps_analysis
  ADD COLUMN IF NOT EXISTS analysis_progress JSONB,
  ADD COLUMN IF NOT EXISTS analysis_error TEXT,
  ADD COLUMN IF NOT EXISTS ai_positives JSONB,
  ADD COLUMN IF NOT EXISTS ai_negatives JSONB;

ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS store_review_id TEXT;

ALTER TABLE apps_analysis DROP CONSTRAINT IF EXISTS apps_analysis_status_check;
ALTER TABLE apps_analysis
  ADD CONSTRAINT apps_analysis_status_check
  CHECK (status IN ('scraped', 'queued', 'processing', 'analyzed', 'failed'));

-- ------------------------------------------------------------
-- 3. İndeksler
-- ------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_reviews_analysis_id ON reviews(analysis_id);
CREATE INDEX IF NOT EXISTS idx_apps_analysis_created_at ON apps_analysis(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_date ON reviews(date DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_store_review_id
  ON reviews (store_review_id)
  WHERE store_review_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reviews_store_review_id_lookup
  ON reviews (store_review_id);
