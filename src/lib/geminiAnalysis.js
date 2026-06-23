import {
  estimateGeminiRequests,
  getGeminiConfig,
} from '@/lib/geminiConfig';
import { getGeminiRateLimiter } from '@/lib/geminiRateLimiter';

const VALID_SENTIMENTS = new Set(['positive', 'neutral', 'negative']);

export class GeminiApiError extends Error {
  constructor(userMessage, { code = 500, retrySeconds = 0 } = {}) {
    super(userMessage);
    this.name = 'GeminiApiError';
    this.userMessage = userMessage;
    this.code = code;
    this.retrySeconds = retrySeconds;
    this.statusCode = code === 429 ? 429 : code === 404 ? 502 : 500;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isHighDemandMessage(message) {
  return /high demand|overloaded|temporarily unavailable|resource exhausted|capacity/i.test(
    String(message || '')
  );
}

export function parseGeminiApiError(error) {
  const raw = error?.message || String(error);

  try {
    const payload = JSON.parse(raw);
    const apiError = payload.error || payload;
    const code = apiError.code || apiError.status || 500;
    const message = apiError.message || raw;

    let retrySeconds = 0;
    const retryMatch = message.match(/retry in ([\d.]+)s/i);
    if (retryMatch) {
      retrySeconds = Math.ceil(parseFloat(retryMatch[1]));
    }

    if (Array.isArray(apiError.details)) {
      const retryInfo = apiError.details.find((detail) =>
        String(detail['@type'] || '').includes('RetryInfo')
      );
      if (retryInfo?.retryDelay) {
        const parsedDelay = Number.parseFloat(String(retryInfo.retryDelay).replace('s', ''));
        if (!Number.isNaN(parsedDelay)) {
          retrySeconds = Math.max(retrySeconds, Math.ceil(parsedDelay));
        }
      }
    }

    let userMessage = message;
    if (code === 429) {
      userMessage = retrySeconds > 0
        ? `Gemini API hız limitine takıldı. Yaklaşık ${retrySeconds} saniye sonra tekrar denenecek. (Ücretsiz plan: ~10 istek/dakika, ~250 istek/gün)`
        : 'Gemini API kota veya hız limitine ulaşıldı. Bir süre bekleyip tekrar deneyin veya Google AI Studio kotanızı kontrol edin.';
    } else if (code === 404) {
      userMessage = 'Seçilen Gemini modeli bulunamadı. .env.local dosyasında GEMINI_MODEL değerini kontrol edin (önerilen: gemini-2.5-flash).';
    } else if (code === 503 || isHighDemandMessage(message)) {
      if (retrySeconds === 0) retrySeconds = 30;
      userMessage =
        `Gemini modeli şu an yoğun (Google tarafında geçici). Yaklaşık ${retrySeconds} saniye sonra otomatik tekrar denenecek. ` +
        'Devam ederse birkaç dakika bekleyip "Tekrar Dene" kullanın veya .env.local içinde GEMINI_MODEL=gemini-2.5-flash-lite deneyin.';
    }

    return { code, message, retrySeconds, userMessage };
  } catch {
    if (isHighDemandMessage(raw)) {
      return {
        code: 503,
        message: raw,
        retrySeconds: 30,
        userMessage:
          'Gemini modeli şu an yoğun (Google tarafında geçici). Otomatik tekrar denenecek; birkaç dakika sonra "Tekrar Dene" de kullanabilirsiniz. ' +
          'Alternatif: .env.local içinde GEMINI_MODEL=gemini-2.5-flash-lite',
      };
    }

    return {
      code: 500,
      message: raw,
      retrySeconds: 0,
      userMessage: raw,
    };
  }
}

function isRetryableGeminiError(parsed) {
  if (parsed.code === 429 || parsed.code === 503) {
    return true;
  }

  return isHighDemandMessage(parsed.message);
}

function wrapGeminiError(error) {
  if (error instanceof GeminiApiError) {
    return error;
  }

  const parsed = parseGeminiApiError(error);
  return new GeminiApiError(parsed.userMessage, parsed);
}

function getRetryDelayMs(parsed, attempt, config) {
  if (parsed.retrySeconds > 0) {
    return parsed.retrySeconds * 1000 + 500;
  }

  if (parsed.code === 503 || isHighDemandMessage(parsed.message)) {
    return Math.min(30000 * attempt, 120000);
  }

  const backoffMs = config.minRequestIntervalMs * Math.pow(2, attempt - 1);
  return Math.min(backoffMs, 120000);
}

export function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export function formatReviewsText(reviews, startIndex = 0) {
  return reviews
    .map((r, index) => {
      const comment = (r.comment || '').replace(/"/g, "'");
      return `${startIndex + index}: [Puan: ${r.rating}] "${comment}"`;
    })
    .join('\n');
}

function parseGeminiJson(text) {
  return JSON.parse(text);
}

async function callGemini(ai, prompt, config, attempt = 1, onProgress = null) {
  const rateLimiter = getGeminiRateLimiter();

  try {
    const response = await rateLimiter.schedule(() =>
      ai.models.generateContent({
        model: config.model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      })
    );

    const text = response.text;
    if (!text) {
      throw new Error('Gemini API returned an empty response.');
    }

    try {
      return parseGeminiJson(text);
    } catch (error) {
      console.error('Failed to parse Gemini JSON response:', text);
      throw new Error('AI did not return a valid JSON structure. Please try again.');
    }
  } catch (error) {
    const parsed = parseGeminiApiError(error);

    if (isRetryableGeminiError(parsed) && attempt < config.maxRetries) {
      const delayMs = getRetryDelayMs(parsed, attempt, config);
      const delaySec = Math.ceil(delayMs / 1000);

      console.warn(
        `Gemini transient error (code=${parsed.code}, attempt ${attempt}/${config.maxRetries}). Retrying in ${delaySec}s...`
      );

      // Pulse countdown status to database during rate-limit retry sleeps
      for (let sec = delaySec; sec > 0; sec--) {
        if (onProgress) {
          await onProgress({
            phase: 'retry_wait',
            current: attempt,
            total: config.maxRetries,
            message: `Hız limitine takıldı (429). ${sec} saniye sonra otomatik tekrar denenecek (Deneme ${attempt}/${config.maxRetries})...`,
          });
        }
        await sleep(1000);
      }

      return callGemini(ai, prompt, config, attempt + 1, onProgress);
    }

    throw wrapGeminiError(error);
  }
}

function buildChunkPrompt(analysis, reviewsText, chunkLabel) {
  const platformLabel = analysis.platform === 'ios' ? 'iOS App Store' : 'Google Play Store';

  return `Aşağıda, "${analysis.app_name}" (${platformLabel}) uygulamasına ait kullanıcı yorumlarının ${chunkLabel} bölümü verilmiştir. Bu yorumları incele ve Türkçe olarak analiz et.

Yorumlar:
${reviewsText}

Sadece ham JSON döndür. Markdown veya açıklama ekleme.

{
  "chunk_summary": "Bu yorum grubunun kısa Türkçe özeti (2-4 cümle).",
  "chunk_positives": [
    "Olumlu yorumlarda öne çıkan beğenilme nedeni (ne beğenilmiş, neden sevilmiş sebepleriyle)"
  ],
  "chunk_negatives": [
    "Kullanıcıların beğenmediği veya eksik bulduğu özellik veya durum (ne beğenilmemiş, ne eksik ayrıntısıyla)"
  ],
  "chunk_bugs": [
    "Bu grupta sık geçen teknik hata veya problem"
  ],
  "chunk_features": [
    "Bu grupta sık talep edilen özellik veya geliştirme önerisi"
  ],
  "review_sentiments": {
    "0": "positive",
    "1": "negative"
  }
}

Kurallar:
- review_sentiments içinde yukarıdaki TÜM yorum indeksleri için 'positive', 'neutral' veya 'negative' değerlerini ver.
- chunk_positives, chunk_negatives, chunk_bugs ve chunk_features en fazla 5 madde olsun; yoksa boş dizi döndür.`;
}

function buildSynthesisPrompt(analysis, synthesisInput) {
  const platformLabel = analysis.platform === 'ios' ? 'iOS App Store' : 'Google Play Store';
  const { totalReviews, sentiment_distribution, chunkSummaries, bugs, features, positives, negatives } = synthesisInput;

  return `"${analysis.app_name}" (${platformLabel}) uygulamasının ${totalReviews} kullanıcı yorumu parçalar halinde analiz edildi. Aşağıdaki ara sonuçları birleştirerek nihai analizi üret.

Duygu dağılımı (yorum bazlı hesaplandı):
- Olumlu: %${sentiment_distribution.positive}
- Nötr: %${sentiment_distribution.neutral}
- Olumsuz: %${sentiment_distribution.negative}

Parça özetleri:
${chunkSummaries.map((summary, index) => `${index + 1}. ${summary}`).join('\n')}

Öne çıkan beğenilme sebepleri (ham liste):
${positives.length > 0 ? positives.map((item) => `- ${item}`).join('\n') : '- Yok'}

Eksik görülen veya beğenilmeyen özellikler (ham liste):
${negatives.length > 0 ? negatives.map((item) => `- ${item}`).join('\n') : '- Yok'}

Tespit edilen hatalar (ham liste):
${bugs.length > 0 ? bugs.map((item) => `- ${item}`).join('\n') : '- Yok'}

Özellik talepleri (ham liste):
${features.length > 0 ? features.map((item) => `- ${item}`).join('\n') : '- Yok'}

Sadece ham JSON döndür:

{
  "ai_summary": "Tüm yorumların birleşik, detaylı Türkçe analiz özeti.",
  "ai_positives": [
    "Kullanıcıların en çok beğendiği yönler ve sevilme nedenleri (en fazla 8 madde, benzerleri birleştir)"
  ],
  "ai_negatives": [
    "Uygulamada en çok eleştirilen, beğenilmeyen veya eksik görülen özellikler (en fazla 8 madde, benzerleri birleştir)"
  ],
  "ai_bugs": [
    "En sık geçen teknik hata veya problem (en fazla 8 madde, tekrarları birleştir)"
  ],
  "ai_features": [
    "En sık talep edilen özellik (en fazla 8 madde, tekrarları birleştir)"
  ]
}`;
}

function normalizeSentiment(value) {
  return VALID_SENTIMENTS.has(value) ? value : 'neutral';
}

export function computeSentimentDistribution(reviewSentiments, totalCount) {
  let positive = 0;
  let neutral = 0;
  let negative = 0;

  for (let index = 0; index < totalCount; index++) {
    const sentiment = normalizeSentiment(reviewSentiments[String(index)]);
    if (sentiment === 'positive') positive += 1;
    else if (sentiment === 'negative') negative += 1;
    else neutral += 1;
  }

  const positivePct = Math.round((positive / totalCount) * 100);
  const negativePct = Math.round((negative / totalCount) * 100);
  const neutralPct = Math.max(0, 100 - positivePct - negativePct);

  return {
    positive: positivePct,
    neutral: neutralPct,
    negative: negativePct,
  };
}

async function analyzeChunk(ai, analysis, chunk, globalStartIndex, chunkNumber, totalChunks, config, onProgress = null) {
  const reviewsText = formatReviewsText(chunk, globalStartIndex);
  const chunkLabel = totalChunks > 1 ? `${chunkNumber}/${totalChunks}` : 'tek';
  const prompt = buildChunkPrompt(analysis, reviewsText, chunkLabel);
  const parsed = await callGemini(ai, prompt, config, 1, onProgress);

  const localSentiments = parsed.review_sentiments || {};
  const globalSentiments = {};

  chunk.forEach((_, localIndex) => {
    const globalIndex = globalStartIndex + localIndex;
    globalSentiments[String(globalIndex)] = normalizeSentiment(
      localSentiments[String(localIndex)] ?? localSentiments[String(globalIndex)]
    );
  });

  return {
    review_sentiments: globalSentiments,
    chunk_summary: parsed.chunk_summary || '',
    chunk_positives: Array.isArray(parsed.chunk_positives) ? parsed.chunk_positives : [],
    chunk_negatives: Array.isArray(parsed.chunk_negatives) ? parsed.chunk_negatives : [],
    chunk_bugs: Array.isArray(parsed.chunk_bugs) ? parsed.chunk_bugs : [],
    chunk_features: Array.isArray(parsed.chunk_features) ? parsed.chunk_features : [],
  };
}

function dedupeStrings(items) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    const normalized = String(item || '').trim();
    if (!normalized) continue;

    const key = normalized.toLocaleLowerCase('tr-TR');
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(normalized);
  }

  return result;
}

export function validateAnalysisQuota(reviewCount, config = getGeminiConfig()) {
  const estimatedRequests = estimateGeminiRequests(reviewCount, config.chunkSize);

  if (estimatedRequests > config.maxDailyRequests) {
    throw new GeminiApiError(
      `Bu analiz yaklaşık ${estimatedRequests} Gemini isteği gerektirir; günlük ücretsiz limit (~${config.maxDailyRequests}) aşılabilir. GEMINI_CHUNK_SIZE değerini artırın veya daha az yorum kazıyın.`,
      { code: 429 }
    );
  }

  return estimatedRequests;
}

export async function analyzeReviewsWithGemini(ai, analysis, reviews, { onProgress } = {}) {
  const config = getGeminiConfig();
  const estimatedRequests = validateAnalysisQuota(reviews.length, config);
  const chunks = chunkArray(reviews, config.chunkSize);
  const hasSynthesis = chunks.length > 1;
  const totalSteps = chunks.length + (hasSynthesis ? 1 : 0) + 1;

  console.info(
    `Gemini analysis starting: ${reviews.length} reviews, ${chunks.length} chunks, ~${estimatedRequests} API calls, model=${config.model}, interval=${config.minRequestIntervalMs}ms`
  );

  const chunkResults = [];

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const result = await analyzeChunk(
      ai,
      analysis,
      chunks[chunkIndex],
      chunkIndex * config.chunkSize,
      chunkIndex + 1,
      chunks.length,
      config,
      onProgress
    );
    chunkResults.push(result);

    if (onProgress) {
      await onProgress({
        phase: 'chunks',
        current: chunkIndex + 1,
        total: totalSteps,
        message:
          chunks.length > 1
            ? `Yorum parçası ${chunkIndex + 1}/${chunks.length} analiz edildi`
            : 'Yorumlar analiz ediliyor...',
      });
    }
  }

  const reviewSentiments = {};
  for (const result of chunkResults) {
    Object.assign(reviewSentiments, result.review_sentiments);
  }

  const sentiment_distribution = computeSentimentDistribution(reviewSentiments, reviews.length);

  let ai_summary;
  let ai_positives;
  let ai_negatives;
  let ai_bugs;
  let ai_features;

  if (chunks.length === 1) {
    ai_summary = chunkResults[0].chunk_summary || 'Analiz yapılamadı.';
    ai_positives = chunkResults[0].chunk_positives;
    ai_negatives = chunkResults[0].chunk_negatives;
    ai_bugs = chunkResults[0].chunk_bugs;
    ai_features = chunkResults[0].chunk_features;
  } else {
    if (onProgress) {
      await onProgress({
        phase: 'synthesis',
        current: chunks.length + 1,
        total: totalSteps,
        message: 'Parça sonuçları birleştiriliyor...',
      });
    }

    const synthesisInput = {
      totalReviews: reviews.length,
      sentiment_distribution,
      chunkSummaries: chunkResults
        .map((result) => result.chunk_summary)
        .filter(Boolean),
      positives: dedupeStrings(chunkResults.flatMap((result) => result.chunk_positives)),
      negatives: dedupeStrings(chunkResults.flatMap((result) => result.chunk_negatives)),
      bugs: dedupeStrings(chunkResults.flatMap((result) => result.chunk_bugs)),
      features: dedupeStrings(chunkResults.flatMap((result) => result.chunk_features)),
    };

    const synthesis = await callGemini(
      ai,
      buildSynthesisPrompt(analysis, synthesisInput),
      config,
      1,
      onProgress
    );

    ai_summary = synthesis.ai_summary || 'Analiz yapılamadı.';
    ai_positives = Array.isArray(synthesis.ai_positives) ? synthesis.ai_positives : synthesisInput.positives.slice(0, 8);
    ai_negatives = Array.isArray(synthesis.ai_negatives) ? synthesis.ai_negatives : synthesisInput.negatives.slice(0, 8);
    ai_bugs = Array.isArray(synthesis.ai_bugs) ? synthesis.ai_bugs : synthesisInput.bugs.slice(0, 8);
    ai_features = Array.isArray(synthesis.ai_features) ? synthesis.ai_features : synthesisInput.features.slice(0, 8);
  }

  return {
    sentiment_distribution,
    ai_summary,
    ai_positives,
    ai_negatives,
    ai_bugs,
    ai_features,
    review_sentiments: reviewSentiments,
    chunksProcessed: chunks.length,
    estimatedRequests,
    model: config.model,
  };
}
