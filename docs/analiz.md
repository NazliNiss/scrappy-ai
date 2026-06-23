# Proje Analiz ve Sistem Mimarisi Raporu

Bu doküman, **ScrappyAI** (App Store & Google Play Store Yorum Kazıma ve AI Analiz Uygulaması) projesinin teknik mimarisini, veri akış şemalarını, veritabanı yapısını ve yapay zeka entegrasyon detaylarını analiz etmek amacıyla hazırlanmıştır.

---

## 1. Mimarî Genel Bakış

Uygulama, monolitik bir yaklaşımla **Next.js (App Router)** üzerinde geliştirilmiştir. Arayüz (Frontend) ve servisler (Backend/API) aynı proje altında barındırılarak sunucu-istemci iletişimi optimize edilmiştir.

### Kullanılan Teknoloji Yığını

| Katman | Teknoloji |
|--------|-----------|
| Frontend | React 19, Next.js 16 (App Router), Lucide Icons, CSS Modules, dark mode |
| Backend | Next.js Route Handlers (`runtime: nodejs` analiz rotasında) |
| Kazıma | `google-play-scraper`, `app-store-scraper` |
| AI | `@google/genai` — Gemini 2.5 Flash (varsayılan, `GEMINI_MODEL` ile değiştirilebilir) |
| Veritabanı | Supabase (PostgreSQL) |
| Export | `xlsx` (Excel) |

---

## 2. İki Aşamalı Veri Akışı

Yapay zeka API maliyetlerini ve kota aşımlarını en aza indirmek için sistem **kullanıcı kontrollü iki aşamalı bir akış** üzerine tasarlanmıştır.

```
[Kullanıcı] ──(1. Uygulama Ara / ID Gir)──> [Next.js Backend]
                                                 │
                                           (Mağaza Kazıma + Dedup)
                                                 │
                                                 ▼
[Supabase DB] <──(2. Ham Yorumları Kaydet)── [Mağaza Servisleri]
      │
 status: scraped
      │
[Kullanıcı] ──(3. "AI Analizini Başlat")──> POST /api/analyze
                                                 │
                                    (Kuyruk → Tek aktif job)
                                                 │
                                          [Gemini API]
                                                 │
                                                 ▼
[Supabase DB] <──(4. Analiz + duygu etiketleri)── [runAnalysisJob]
      │
 status: analyzed
      │
      ▼
[Analiz Detayı] — grafik, listeler, filtreli tablo, Excel
```

### Aşama 1: Kazıma ve Ham Kayıt

1. Kullanıcı `/scrape` üzerinden arama yapar veya manuel paket/ID girer.
2. Sunucu mağazadan belirtilen adette (**1–1000**) **yeni** yorum hedefler.
3. Aynı `app_id` + `platform` için daha önce kayıtlı `store_review_id` değerleri atlanır (dedup).
4. Yeni kayıt `apps_analysis` (`status: scraped`) ve `reviews` tablolarına yazılır. Gemini çağrılmaz.

**Platform limitleri:**

| Platform | Davranış |
|----------|----------|
| Android | Sayfalama ile hedefe ulaşana kadar devam eder |
| iOS | En fazla ~10 sayfa × ~50 yorum ≈ **500 yorum** üst sınırı |

### Aşama 2: Yapay Zeka Analizi

1. Kullanıcı `/analysis/[id]` ekranından **AI Analizini Başlat** ile tetikler.
2. `POST /api/analyze` hemen **202** döner; iş `runAnalysisJob` ile arka planda sürer.
3. Başka analiz devam ediyorsa yeni istek **`queued`** durumuna alınır (tek aktif job kuralı).
4. Yorumlar **100'lük parçalara** bölünür (`GEMINI_CHUNK_SIZE`, varsayılan 100).
5. Gemini istekleri **sıralı** gönderilir (`GeminiRateLimiter`, ~7.5 sn aralık).
6. Birden fazla parça varsa **synthesis** çağrısı ile özet ve listeler birleştirilir.
7. Duygu yüzdeleri AI tahmini değil; etiketlenen yorum sayılarından hesaplanır.
8. Sonuçlar DB'ye yazılır (`status: analyzed`); her yoruma `sentiment` atanır.

---

## 3. Panel Arayüzü ve Kullanıcı Akışı

Sidebar'lı **admin panel**. Giriş yapılmadan (`/login`) panele erişilemez (`src/proxy.js`).

### Sidebar Menüsü

| Menü | Rota | Açıklama |
|------|------|----------|
| Genel Bakış | `/dashboard` | İstatistik kartları, son 5 aktivite, hızlı işlemler |
| Yeni Analiz | `/scrape` | Mağaza araması veya manuel ID ile kazıma |
| Geçmiş | `/history` | Tüm kayıtlar, silme |
| AI Raporları | `/reports` | Tamamlanmış AI raporları + devam eden analizler |

`/` rotası giriş durumuna göre `/dashboard` veya `/login`'e yönlendirir.

### Uçtan Uca Akış

```
[Giriş /login]
      │
      ▼
[/dashboard] ──veya──> [/scrape]
      │                      │
      │               POST /api/scrape
      │                      ▼
      │            [/analysis/{id}]  status: scraped
      │                      │
      │            POST /api/analyze (202)
      │                      │
      │         processing / queued / analyzed / failed
      │                      │
      ├──────────────────────┤
      ▼                      ▼
[/history]            [/reports]
```

### Ekran Detayları

#### `/scrape` — Yeni Analiz

- Arama sekmesi (App Store + Google Play birlikte) veya manuel ID
- Yorum limiti (100–1000), ülke seçimi (`country`, varsayılan `tr`)
- Platform seçicide App Store / Google Play logoları
- Kazıma sonrası `/analysis/{id}` yönlendirmesi; atlanan/yeni yorum sayısı query param ile iletilir

#### `/analysis/[id]` — Analiz Detayı

| Durum | Ekran |
|-------|-------|
| `scraped` | Ham yorum tablosu + AI başlat butonu |
| `queued` | Sıra pozisyonu, bekleme mesajı |
| `processing` | Progress bar, parça/birleştirme/kaydetme aşamaları |
| `failed` | Hata mesajı + tekrar dene |
| `analyzed` | Özet, duygu grafiği (SVG), olumlu/olumsuz, hatalar, istekler, filtreli/sıralı yorum tablosu, Excel export, mağaza linki |

Canlı durum: `AnalysisProgressProvider` + `GET /api/analyze?analysisId=...` polling (10 sn).

#### `/history` — Geçmiş

- Tüm durumlar listelenir
- Rozetler: Kazındı, Sırada, İşleniyor, Analiz Edildi, Başarısız
- Aktif analiz varken 10 sn'de bir liste yenilenir
- Kayıt silinebilir (cascade: yorumlar da silinir)

#### `/reports` — AI Raporları

- `analyzed` kayıtlar kart grid
- `processing` / `queued` kayıtlar üst bölümde
- `scraped` bekleyen kayıt sayısı bilgi banner'ında

#### `/dashboard` — Genel Bakış

- Toplam analiz, AI tamamlanma oranı, ortalama memnuniyet, toplam yorum
- iOS / Android dağılımı
- Son 5 aktivite (compact HistoryList)

### Durum Makinesi (`apps_analysis.status`)

| Durum | Anlam | Geçiş |
|-------|-------|-------|
| `scraped` | Yorumlar kazındı, AI bekliyor | Kazıma sonrası varsayılan |
| `queued` | AI kuyruğunda bekliyor | Başka analiz aktifken POST /api/analyze |
| `processing` | AI analizi devam ediyor | Job başlayınca |
| `analyzed` | AI tamamlandı | Job başarıyla biter |
| `failed` | AI hata verdi | Job exception veya Gemini hatası |

---

## 4. Veritabanı Şeması

Kaynak: `database/schema.sql` (tek dosya; yeni kurulum + migration).

### `apps_analysis`

| Kolon | Tip | Açıklama |
|-------|-----|----------|
| `id` | uuid (PK) | Analiz kaydı |
| `app_id` | text | Paket adı veya iOS app ID |
| `app_name` | text | Uygulama adı |
| `platform` | text | `ios` \| `android` |
| `logo_url` | text | İkon URL |
| `total_reviews_scraped` | integer | Bu kayıttaki yorum sayısı |
| `sentiment_distribution` | jsonb | `{ positive, neutral, negative }` yüzdeler |
| `ai_summary` | text | Genel AI özeti |
| `ai_positives` | jsonb | Olumlu / beğenilme maddeleri |
| `ai_negatives` | jsonb | Olumsuz / eksiklik maddeleri |
| `ai_bugs` | jsonb | Teknik hata maddeleri |
| `ai_features` | jsonb | Özellik talepleri |
| `status` | text | Durum makinesi (yukarıda) |
| `analysis_progress` | jsonb | Canlı ilerleme (`phase`, `percent`, `message`, `queuePosition`…) |
| `analysis_error` | text | Son hata mesajı |
| `created_at` | timestamptz | Oluşturulma |

### `reviews`

| Kolon | Tip | Açıklama |
|-------|-----|----------|
| `id` | uuid (PK) | Yorum kaydı |
| `analysis_id` | uuid (FK) | `apps_analysis.id` (ON DELETE CASCADE) |
| `store_review_id` | text | Mağaza yorum ID (dedup; partial unique index) |
| `user_name` | text | Kullanıcı adı |
| `rating` | integer | 0–5 |
| `comment` | text | Yorum metni |
| `date` | timestamptz | Yorum tarihi |
| `sentiment` | text | `positive` \| `neutral` \| `negative` (AI sonrası) |
| `created_at` | timestamptz | DB kayıt tarihi |

### İndeksler

- `idx_reviews_analysis_id`
- `idx_apps_analysis_created_at`
- `idx_reviews_date`
- `idx_reviews_store_review_id` (unique, `WHERE store_review_id IS NOT NULL`)

---

## 5. Yapay Zeka Tasarımı

Model: **Gemini 2.5 Flash** (varsayılan). Yoğunlukta `gemini-2.5-flash-lite` önerilir.

### Prompt stratejisi

- **Chunk boyutu:** 100 yorum (`GEMINI_CHUNK_SIZE`)
- **Eşzamanlılık:** 1 (`GEMINI_MAX_CONCURRENT=1`); istekler `GeminiRateLimiter` ile sıraya alınır
- **Format:** `[Index]: [Puan] "Yorum"` metin bloğu
- **Çıktı:** `responseMimeType: application/json`
- **Parça çıktıları:** `review_sentiments`, özet, olumlu/olumsuz, bug, feature listeleri
- **Synthesis:** Çok parçalı analizde tek birleştirme çağrısı
- **Duygu dağılımı:** Etiket sayımlarından hesaplanır (`computeSentimentDistribution`)

### AI analiz kuyruğu

`src/lib/runAnalysisJob.js`:

- Bellek içi kuyruk: `activeJobId` + `pendingQueue`
- Aynı anda **tek** analiz çalışır
- Sunucu restart sonrası DB'den `queued` / `processing` kayıtları belleğe yüklenir (`recoverQueueFromDb`)
- Bir job bittiğinde veya hata verdiğinde `processNextInQueue()` sıradakini başlatır
- **Stale temizlik:** Bellekte çalışmayan `processing` kayıtları `ANALYSIS_STALE_TIMEOUT_MS` (varsayılan 30 dk) aşılırsa `failed` olur; kullanıcı "Tekrar Dene" ile yeniden başlatabilir
- **Recovery:** Sunucu restart sonrası süresi dolmamış `processing` / `queued` kayıtlar kuyruğa alınır ve otomatik devam eder
- `maintainAnalysisQueue()` — `GET /api/analyze` ve `GET /api/history?scope=processing` sırasında stale temizlik + kuyruk ilerletme

> **Sınırlama:** Kuyruk tek Node process belleğindedir; çoklu instance veya cold start senaryolarında ek DB tabanlı job koordinasyonu gerekebilir.

### İlgili dosyalar

| Dosya | Rol |
|-------|-----|
| `src/lib/geminiAnalysis.js` | Chunk, synthesis, retry, quota kontrolü |
| `src/lib/geminiConfig.js` | Model ve rate limit varsayılanları |
| `src/lib/geminiRateLimiter.js` | Sıralı istek aralığı |
| `src/lib/runAnalysisJob.js` | Arka plan job + kuyruk |
| `src/app/api/analyze/route.js` | POST (202) / GET progress |
| `src/context/AnalysisProgressProvider.js` | Panel geneli polling ve banner |

---

## 6. Arka Plan İlerleme ve Polling

| Bileşen | Davranış |
|---------|----------|
| `AnalysisProgressProvider` | Mount'ta bir kez kontrol; aktif job varsa **10 sn**'de bir `GET /api/history?scope=processing` |
| `AnalysisJobBanner` | Devam eden ve yeni tamamlanan analizler |
| `useAnalysisDetailPolling` | Detay sayfasında `GET /api/analyze?analysisId=...` (10 sn) |
| `/history`, `/reports` | Aktif job varken tam liste 10 sn'de bir yenilenir |

Aktif analiz yokken gereksiz polling yapılmaz.

---

## 7. Yorum Dedup

`src/lib/reviewDedup.js`:

1. Kazıma öncesi aynı `app_id` + `platform` için mevcut `store_review_id` seti okunur.
2. Kazıma sırasında bilinen ID'ler atlanır; hedef **N yeni yorum**.
3. Unique index ile DB seviyesinde de koruma sağlanır.

Eski kayıtlarda `store_review_id` boş olabilir; dedup yalnızca yeni kazımalardan itibaren tam etkilidir.

---

## 8. Güvenlik, Performans ve Limitler

1. **Kimlik doğrulama:** HMAC imzalı httpOnly cookie (`AUTH_USERNAME`, `AUTH_PASSWORD`, `AUTH_SECRET`). Koruma: `src/proxy.js`, `src/lib/apiAuth.js`.
2. **Anahtar güvenliği:** Gemini ve Supabase service role yalnızca sunucuda.
3. **Batch yazım:** Kazıma insert 200'lük; AI sonrası review upsert 100'lük.
4. **Gemini rate limit (ücretsiz plan varsayılanları):**
   - ~8 RPM hedefi, istekler arası 7500 ms
   - 429 / 503 otomatik retry + Türkçe kullanıcı mesajı
   - Analiz öncesi tahmini istek sayısı kontrolü (`validateAnalysisQuota`)
5. **Grafikler:** Harici chart kütüphanesi yok; inline SVG.

### Tahmini süre (ücretsiz plan, ~7.5 sn/istek)

| Yorum | API çağrısı | Tahmini süre |
|-------|-------------|--------------|
| 100 | 1 | ~8 sn |
| 250 | 3 | ~23 sn |
| 500 | 6 | ~45 sn |
| 1000 | 11 | ~83 sn |

Ücretli planda `GEMINI_MIN_REQUEST_INTERVAL_MS=1000` gibi değerler düşürülebilir.

---

## 9. API Özeti

| Metot | Rota | Not |
|-------|------|-----|
| POST | `/api/scrape` | Dedup'lu kazıma, yeni `apps_analysis` kaydı |
| POST | `/api/analyze` | 202 — `started` \| `queued` \| `alreadyRunning` |
| GET | `/api/analyze?analysisId=` | `status`, `progress`, `isRunning`, `isQueued` |
| GET | `/api/history` | Tüm liste |
| GET | `/api/history?scope=processing` | `processing` + `queued` |
| GET | `/api/history?id=` | Tek kayıt + tüm yorumlar |
| DELETE | `/api/history?id=` | Cascade silme |

---

## 10. Bilinen Sınırlar ve Geliştirme Alanları

| Konu | Durum |
|------|-------|
| Her kazıma yeni analiz kaydı açar | Aynı uygulamaya “yeni yorum ekle” henüz yok |
| Kuyruk bellek içi | Restart / çoklu instance riski |
| Geçmiş API sayfalama | Tüm kayıtlar tek istekte |
| Günlük Gemini kotası | Tek analiz tahmini; gerçek günlük sayaç yok |
| Otomatik test | Unit / integration test yok |
| Stale `processing` | `ANALYSIS_STALE_TIMEOUT_MS` (varsayılan 30 dk) sonrası otomatik `failed`; crash sonrası taze kayıtlar kuyruktan devam eder |

---

*Son güncelleme: proje durum makinesi (`queued`, `processing`, `failed`), AI kuyruğu, dedup, 100'lük chunk, 10 sn polling ve `ai_positives` / `ai_negatives` alanları ile senkronize edilmiştir.*
