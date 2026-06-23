import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/apiAuth';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { GeminiApiError, validateAnalysisQuota } from '@/lib/geminiAnalysis';
import { getGeminiConfig } from '@/lib/geminiConfig';
import {
  getEstimatedDurationSeconds,
  isAnalysisJobQueued,
  isAnalysisJobRunning,
  maintainAnalysisQueue,
  runAnalysisJob,
} from '@/lib/runAnalysisJob';

export const runtime = 'nodejs';

export async function GET(request) {
  const authError = await requireApiAuth(request);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const analysisId = searchParams.get('analysisId');

    if (!analysisId) {
      return NextResponse.json({ error: 'analysisId is required' }, { status: 400 });
    }

    await maintainAnalysisQueue();

    const { data: analysis, error } = await supabaseAdmin
      .from('apps_analysis')
      .select('id, app_name, status, analysis_progress, analysis_error, total_reviews_scraped')
      .eq('id', analysisId)
      .single();

    if (error || !analysis) {
      return NextResponse.json({ error: 'Analysis record not found' }, { status: 404 });
    }

    const queued = analysis.status === 'queued' || isAnalysisJobQueued(analysisId);
    const running = analysis.status === 'processing' || isAnalysisJobRunning(analysisId);
    const effectiveStatus = queued
      ? 'queued'
      : running && analysis.status !== 'analyzed'
        ? 'processing'
        : analysis.status;

    return NextResponse.json({
      analysisId: analysis.id,
      appName: analysis.app_name,
      status: effectiveStatus,
      progress: analysis.analysis_progress,
      error: analysis.analysis_error,
      isRunning: running,
      isQueued: queued,
      queuePosition: analysis.analysis_progress?.queuePosition ?? null,
    });
  } catch (error) {
    console.error('Analyze GET error:', error);
    return NextResponse.json(
      { error: error.message || 'İlerleme bilgisi alınamadı.' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  const authError = await requireApiAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const { analysisId } = body;

    if (!analysisId) {
      return NextResponse.json({ error: 'analysisId is required' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your-gemini-api-key') {
      return NextResponse.json(
        {
          error:
            'Gemini API key is not configured in .env.local file. Please add your GEMINI_API_KEY.',
        },
        { status: 500 }
      );
    }

    const { data: analysis, error: analysisError } = await supabaseAdmin
      .from('apps_analysis')
      .select('id, status, total_reviews_scraped')
      .eq('id', analysisId)
      .single();

    if (analysisError || !analysis) {
      return NextResponse.json({ error: 'Analysis record not found' }, { status: 404 });
    }



    if (analysis.status === 'processing' || isAnalysisJobRunning(analysisId)) {
      return NextResponse.json(
        {
          started: true,
          alreadyRunning: true,
          analysisId,
          message: 'Analiz zaten devam ediyor.',
        },
        { status: 202 }
      );
    }

    if (analysis.status === 'queued' || isAnalysisJobQueued(analysisId)) {
      return NextResponse.json(
        {
          queued: true,
          alreadyQueued: true,
          analysisId,
          queuePosition: analysis.analysis_progress?.queuePosition ?? null,
          message: 'Analiz zaten sırada bekliyor.',
        },
        { status: 202 }
      );
    }

    const { count: reviewCount, error: countError } = await supabaseAdmin
      .from('reviews')
      .select('*', { count: 'exact', head: true })
      .eq('analysis_id', analysisId);

    if (countError || !reviewCount) {
      return NextResponse.json(
        { error: 'No reviews found for this analysis record' },
        { status: 404 }
      );
    }

    try {
      validateAnalysisQuota(reviewCount, getGeminiConfig());
    } catch (error) {
      if (error instanceof GeminiApiError) {
        return NextResponse.json({ error: error.userMessage }, { status: error.statusCode });
      }
      throw error;
    }

    const estimatedDurationSeconds = getEstimatedDurationSeconds(reviewCount);

    const jobResult = await runAnalysisJob(analysisId);

    if (jobResult.alreadyRunning) {
      return NextResponse.json(
        {
          started: true,
          alreadyRunning: true,
          analysisId,
          message: 'Analiz zaten devam ediyor.',
        },
        { status: 202 }
      );
    }

    if (jobResult.alreadyQueued) {
      return NextResponse.json(
        {
          queued: true,
          alreadyQueued: true,
          analysisId,
          queuePosition: jobResult.queuePosition,
          message: 'Analiz zaten sırada bekliyor.',
        },
        { status: 202 }
      );
    }

    if (jobResult.queued) {
      return NextResponse.json(
        {
          queued: true,
          analysisId,
          queuePosition: jobResult.queuePosition,
          message: `Başka bir analiz devam ediyor. Bu analiz ${jobResult.queuePosition}. sırada bekliyor.`,
        },
        { status: 202 }
      );
    }

    return NextResponse.json(
      {
        started: true,
        analysisId,
        estimatedDurationSeconds,
        message:
          'AI analizi arka planda başlatıldı. Başka sayfaya geçebilirsiniz; ilerleme panelden takip edilir.',
      },
      { status: 202 }
    );
  } catch (error) {
    console.error('Analyze POST error:', error);

    if (error instanceof GeminiApiError) {
      return NextResponse.json(
        {
          error: error.userMessage,
          retryAfterSeconds: error.retrySeconds || undefined,
        },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      { error: error.message || 'AI analizi başlatılırken beklenmeyen bir hata oluştu.' },
      { status: 500 }
    );
  }
}
