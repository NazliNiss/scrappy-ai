import { GoogleGenAI } from '@google/genai';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { estimateAnalysisDurationMs, getGeminiConfig } from '@/lib/geminiConfig';
import {
  analyzeReviewsWithGemini,
  GeminiApiError,
  validateAnalysisQuota,
} from '@/lib/geminiAnalysis';

const runningJobs = new Set();
const pendingQueue = [];
let activeJobId = null;
let recoveryPromise = null;

const DEFAULT_STALE_PROCESSING_MS = 30 * 60 * 1000;
const STALE_FAILURE_MESSAGE =
  'Analiz beklenenden uzun sürdü veya sunucu yeniden başlatıldı. Lütfen "Tekrar Dene" ile yeniden başlatın.';

function getStaleProcessingTimeoutMs() {
  const value = Number.parseInt(process.env.ANALYSIS_STALE_TIMEOUT_MS || '', 10);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_STALE_PROCESSING_MS;
}

function stampProgress(progress, { resetStarted = false } = {}) {
  const now = new Date().toISOString();
  return {
    ...progress,
    startedAt: resetStarted ? now : progress.startedAt || now,
    updatedAt: now,
  };
}

function buildInitialProgress(reviewCount, config = getGeminiConfig()) {
  const chunks = Math.max(1, Math.ceil(reviewCount / config.chunkSize));
  const hasSynthesis = chunks > 1;
  const totalSteps = chunks + (hasSynthesis ? 1 : 0) + 1;

  return {
    phase: 'starting',
    current: 0,
    total: totalSteps,
    percent: 0,
    message: 'Analiz hazırlanıyor...',
    chunks,
    hasSynthesis,
  };
}

function buildQueuedProgress(queuePosition) {
  return {
    phase: 'queued',
    queuePosition,
    current: 0,
    total: 1,
    percent: 0,
    message:
      queuePosition <= 1
        ? 'Sırada bekliyor, önceki analiz bitince başlayacak...'
        : `Sırada bekliyor (${queuePosition}. sıra)...`,
  };
}

async function updateProgress(analysisId, progress) {
  const { error } = await supabaseAdmin
    .from('apps_analysis')
    .update({ analysis_progress: stampProgress(progress) })
    .eq('id', analysisId);

  if (error) {
    console.error('Progress update error:', error);
  }
}

async function markQueued(analysisId, queuePosition) {
  const progress = buildQueuedProgress(queuePosition);

  const { error } = await supabaseAdmin
    .from('apps_analysis')
    .update({
      status: 'queued',
      analysis_error: null,
      analysis_progress: progress,
    })
    .eq('id', analysisId);

  if (error) {
    console.error('Queue status update error:', error);
  }
}

async function reindexQueuedPositions() {
  for (let index = 0; index < pendingQueue.length; index += 1) {
    await markQueued(pendingQueue[index], index + 1);
  }
}

async function markFailed(analysisId, message) {
  const queueIndex = pendingQueue.indexOf(analysisId);
  if (queueIndex >= 0) {
    pendingQueue.splice(queueIndex, 1);
  }

  await supabaseAdmin
    .from('apps_analysis')
    .update({
      status: 'failed',
      analysis_error: message,
      analysis_progress: null,
    })
    .eq('id', analysisId);
}

function getLastProgressTouchMs(progress, createdAt) {
  const candidates = [progress?.updatedAt, progress?.startedAt, createdAt];

  for (const value of candidates) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

async function cleanupStaleProcessingJobs() {
  const staleMs = getStaleProcessingTimeoutMs();
  const cutoff = Date.now() - staleMs;

  const { data: rows, error } = await supabaseAdmin
    .from('apps_analysis')
    .select('id, analysis_progress, created_at')
    .eq('status', 'processing');

  if (error) {
    console.error('Stale processing cleanup query error:', error);
    return;
  }

  for (const row of rows || []) {
    if (runningJobs.has(row.id) || activeJobId === row.id) {
      continue;
    }

    const lastTouch = getLastProgressTouchMs(row.analysis_progress, row.created_at);
    if (lastTouch === 0 || lastTouch < cutoff) {
      console.warn(`Marking stale processing job as failed: ${row.id}`);
      await markFailed(row.id, STALE_FAILURE_MESSAGE);
    }
  }
}

async function recoverQueueFromDb() {
  await cleanupStaleProcessingJobs();

  const { data: queuedRows, error: queuedError } = await supabaseAdmin
    .from('apps_analysis')
    .select('id')
    .eq('status', 'queued')
    .order('created_at', { ascending: true });

  if (queuedError) {
    console.error('Queue recovery error:', queuedError);
    return;
  }

  for (const row of queuedRows || []) {
    if (
      !pendingQueue.includes(row.id) &&
      activeJobId !== row.id &&
      !runningJobs.has(row.id)
    ) {
      pendingQueue.push(row.id);
    }
  }

  if (activeJobId !== null) {
    return;
  }

  const { data: processingRows, error: processingError } = await supabaseAdmin
    .from('apps_analysis')
    .select('id')
    .eq('status', 'processing')
    .order('created_at', { ascending: true });

  if (processingError) {
    console.error('Processing recovery error:', processingError);
    return;
  }

  for (const row of processingRows || []) {
    if (
      !pendingQueue.includes(row.id) &&
      activeJobId !== row.id &&
      !runningJobs.has(row.id)
    ) {
      pendingQueue.unshift(row.id);
    }
  }

  processNextInQueue();
}

export async function maintainAnalysisQueue() {
  await ensureQueueRecovery();
  await cleanupStaleProcessingJobs();
  processNextInQueue();
}

async function ensureQueueRecovery() {
  if (!recoveryPromise) {
    recoveryPromise = recoverQueueFromDb();
  }

  await recoveryPromise;
}

function processNextInQueue() {
  if (activeJobId !== null || pendingQueue.length === 0) {
    return;
  }

  const nextId = pendingQueue.shift();
  void reindexQueuedPositions();
  void runAnalysisJobInternal(nextId);
}

export function isAnalysisJobRunning(analysisId) {
  return runningJobs.has(analysisId) || activeJobId === analysisId;
}

export function isAnalysisJobQueued(analysisId) {
  return pendingQueue.includes(analysisId);
}

export function getQueuePosition(analysisId) {
  const index = pendingQueue.indexOf(analysisId);
  return index >= 0 ? index + 1 : null;
}

export function getAnalysisQueueState() {
  return {
    activeJobId,
    running: [...runningJobs],
    queued: [...pendingQueue],
  };
}

export async function runAnalysisJob(analysisId) {
  await ensureQueueRecovery();

  if (runningJobs.has(analysisId) || activeJobId === analysisId) {
    return { alreadyRunning: true };
  }

  const queueIndex = pendingQueue.indexOf(analysisId);
  if (queueIndex >= 0) {
    return { alreadyQueued: true, queuePosition: queueIndex + 1 };
  }

  if (activeJobId !== null) {
    pendingQueue.push(analysisId);
    await markQueued(analysisId, pendingQueue.length);
    return { queued: true, queuePosition: pendingQueue.length };
  }

  activeJobId = analysisId;
  runningJobs.add(analysisId);
  void executeAnalysisJob(analysisId);
  return { started: true };
}

async function runAnalysisJobInternal(analysisId) {
  if (runningJobs.has(analysisId) || activeJobId === analysisId) {
    return { alreadyRunning: true };
  }

  if (activeJobId !== null) {
    pendingQueue.unshift(analysisId);
    return { queued: true, queuePosition: 1 };
  }

  activeJobId = analysisId;
  runningJobs.add(analysisId);
  return executeAnalysisJob(analysisId);
}

async function executeAnalysisJob(analysisId) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your-gemini-api-key') {
      throw new Error('Gemini API key is not configured.');
    }

    const { data: analysis, error: analysisError } = await supabaseAdmin
      .from('apps_analysis')
      .select('*')
      .eq('id', analysisId)
      .single();

    if (analysisError || !analysis) {
      throw new Error('Analysis record not found.');
    }



    const { data: reviews, error: reviewsError } = await supabaseAdmin
      .from('reviews')
      .select('*')
      .eq('analysis_id', analysisId)
      .order('date', { ascending: false });

    if (reviewsError || !reviews || reviews.length === 0) {
      throw new Error('No reviews found for this analysis record.');
    }

    const config = getGeminiConfig();
    validateAnalysisQuota(reviews.length, config);

    const initialProgress = stampProgress(buildInitialProgress(reviews.length, config), {
      resetStarted: true,
    });
    await supabaseAdmin
      .from('apps_analysis')
      .update({
        status: 'processing',
        analysis_error: null,
        analysis_progress: initialProgress,
      })
      .eq('id', analysisId);

    const ai = new GoogleGenAI({ apiKey });
    const savingStepOffset = initialProgress.chunks + (initialProgress.hasSynthesis ? 1 : 0);

    const onProgress = async ({ phase, current, total, message }) => {
      let percent = total > 0 ? Math.min(99, Math.round((current / total) * 100)) : 0;

      // Preserve existing percentage during retry delays so progress bar doesn't fluctuate
      if (phase === 'retry_wait') {
        const { data: currentRecord } = await supabaseAdmin
          .from('apps_analysis')
          .select('analysis_progress')
          .eq('id', analysisId)
          .single();
        if (currentRecord?.analysis_progress?.percent !== undefined) {
          percent = currentRecord.analysis_progress.percent;
        }
      }

      await updateProgress(analysisId, {
        phase,
        current,
        total,
        percent,
        message,
        chunks: initialProgress.chunks,
        hasSynthesis: initialProgress.hasSynthesis,
      });
    };

    const {
      sentiment_distribution,
      ai_summary,
      ai_positives,
      ai_negatives,
      ai_bugs,
      ai_features,
      review_sentiments,
    } = await analyzeReviewsWithGemini(ai, analysis, reviews, { onProgress });

    await onProgress({
      phase: 'saving',
      current: savingStepOffset + 1,
      total: initialProgress.total,
      message: 'Sonuçlar veritabanına kaydediliyor...',
    });

    const { error: updateError } = await supabaseAdmin
      .from('apps_analysis')
      .update({
        sentiment_distribution,
        ai_summary,
        ai_positives,
        ai_negatives,
        ai_bugs,
        ai_features,
        status: 'analyzed',
        analysis_progress: stampProgress({
          phase: 'done',
          current: initialProgress.total,
          total: initialProgress.total,
          percent: 100,
          message: 'Analiz tamamlandı.',
          startedAt: initialProgress.startedAt,
        }),
        analysis_error: null,
      })
      .eq('id', analysisId);

    if (updateError) {
      throw new Error(`Failed to update database metadata: ${updateError.message}`);
    }

    const updatedReviews = reviews.map((review, index) => ({
      ...review,
      sentiment: review_sentiments[String(index)] || 'neutral',
    }));

    const batchSize = 100;
    for (let i = 0; i < updatedReviews.length; i += batchSize) {
      const batch = updatedReviews.slice(i, i + batchSize);
      const { error: upsertError } = await supabaseAdmin.from('reviews').upsert(batch);

      if (upsertError) {
        throw new Error(`Failed to update review sentiments: ${upsertError.message}`);
      }
    }

    return { success: true };
  } catch (error) {
    console.error(`Analysis job failed (${analysisId}):`, error);

    const message =
      error instanceof GeminiApiError
        ? error.userMessage
        : error.message || 'AI analizi sırasında beklenmeyen bir hata oluştu.';

    await markFailed(analysisId, message);
    return { success: false, error: message };
  } finally {
    runningJobs.delete(analysisId);
    if (activeJobId === analysisId) {
      activeJobId = null;
    }
    processNextInQueue();
  }
}

export function getEstimatedDurationSeconds(reviewCount) {
  return Math.ceil(estimateAnalysisDurationMs(reviewCount) / 1000);
}
