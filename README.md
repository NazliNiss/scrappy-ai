# ScrappyAI

App Store ve Google Play yorumlarını kazıyan, Gemini ile duygu analizi ve özet rapor üreten Next.js panel uygulaması.

## Özellikler

- **İki aşamalı akış:** Önce yorum kazıma, sonra manuel AI analizi (API maliyeti kontrolü)
- **Akıllı dedup:** Aynı `store_review_id` tekrar kaydedilmez; hedef “N yeni yorum”
- **AI kuyruğu:** Aynı anda yalnızca bir analiz çalışır; diğerleri `queued` durumunda bekler
- **Arka plan progress:** Analiz sürerken banner, progress bar ve canlı durum senkronu
- **Raporlar:** Duygu dağılımı, olumlu/olumsuz maddeler, hatalar, özellik talepleri, Excel export
- **Panel:** Dark mode, App Store / Google Play rozetleri, geçmiş ve AI rapor listeleri

## Teknoloji

| Katman | Stack |
|--------|--------|
| Frontend | React 19, Next.js 16 (App Router), CSS Modules |
| Backend | Next.js Route Handlers |
| Veritabanı | Supabase (PostgreSQL) |
| AI | Google Gemini (`@google/genai`) |
| Kazıma | `google-play-scraper`, `app-store-scraper` |

Detaylı mimari için [`docs/analiz.md`](docs/analiz.md) dosyasına bakın.

## Kurulum

### 1. Bağımlılıklar

```bash
npm install
```

### 2. Ortam değişkenleri

`.env.example` dosyasını kopyalayın:

```bash
cp .env.example .env.local
```

| Değişken | Zorunlu | Açıklama |
|----------|---------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Evet | Supabase proje URL'i |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Evet | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Evet | Sunucu tarafı işlemler (service role) |
| `GEMINI_API_KEY` | Evet | Google AI Studio API anahtarı |
| `GEMINI_MODEL` | Hayır | Varsayılan: `gemini-2.5-flash` |
| `AUTH_USERNAME` | Production'da önerilir | Panel kullanıcı adı |
| `AUTH_PASSWORD` | Production'da önerilir | Panel şifresi |
| `AUTH_SECRET` | Production'da önerilir | Oturum imza anahtarı (32+ karakter) |

> **Not:** Auth değişkenleri tanımlanmazsa geliştirmede varsayılan `admin` / `1989` kullanılır. Production'da mutlaka kendi değerlerinizi tanımlayın.

### 3. Veritabanı

Supabase SQL Editor'da [`database/schema.sql`](database/schema.sql) dosyasını bir kez çalıştırın. Mevcut kurulumları da günceller (`IF NOT EXISTS` / constraint migration).

### 4. Geliştirme sunucusu

```bash
npm run dev
```

Tarayıcıda [http://localhost:3000](http://localhost:3000) — giriş sonrası `/dashboard` paneline yönlendirilir.

## Panel rotaları

| Rota | Açıklama |
|------|----------|
| `/login` | Giriş |
| `/dashboard` | Genel bakış, istatistikler, son aktiviteler |
| `/scrape` | Uygulama arama / manuel ID ile yorum kazıma |
| `/history` | Tüm analiz kayıtları |
| `/reports` | Tamamlanmış AI raporları |
| `/analysis/[id]` | Analiz detayı, AI başlatma, rapor ve yorum tablosu |

## API uç noktaları

Tüm API rotaları oturum cookie'si ile korunur (`src/proxy.js`).

| Metot | Rota | Açıklama |
|-------|------|----------|
| POST | `/api/auth/login` | Giriş |
| POST | `/api/auth/logout` | Çıkış |
| GET | `/api/search?term=...` | Mağaza araması |
| POST | `/api/scrape` | Yorum kazıma |
| POST | `/api/analyze` | AI analizi başlat (202, arka plan) |
| GET | `/api/analyze?analysisId=...` | Analiz ilerlemesi |
| GET | `/api/history` | Tüm kayıtlar |
| GET | `/api/history?scope=processing` | Devam eden / sıradaki analizler |
| GET | `/api/history?id=...` | Tek kayıt + yorumlar |
| DELETE | `/api/history?id=...` | Kayıt sil |

## Production (Render vb.)

1. Ortam değişkenlerini platform panelinde tanımlayın (`AUTH_*` dahil).
2. Build komutu: `npm run build`
3. Start komutu: `npm start`
4. Supabase service role key'in anon key ile aynı olmadığından emin olun.

**Render free tier uyarısı:** Sunucu uyku moduna girerse uzun AI analizleri kesilebilir. Kuyruk bellek içinde tutulur; restart sonrası `queued` / `processing` kayıtların devamı için sunucunun ayakta kalması gerekir.

## Proje yapısı

```
src/
  app/
    (panel)/          # Panel sayfaları
    api/              # Route handlers
    login/
  components/         # UI bileşenleri
  context/            # AnalysisProgressProvider
  lib/                # Auth, Gemini, kazıma, kuyruk
database/
  schema.sql          # Tek dosya DB şeması + migration
docs/
  analiz.md           # Detaylı mimari dokümantasyon
```

## Scriptler

```bash
npm run dev      # Geliştirme
npm run build    # Production build
npm run start    # Production sunucu
npm run lint     # ESLint
```
