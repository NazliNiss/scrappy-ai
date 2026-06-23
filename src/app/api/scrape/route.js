import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/apiAuth';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { getExistingStoreReviewIds } from '@/lib/reviewDedup';
import { collectNewReviews } from '@/lib/scrapeReviews';

export async function POST(request) {
  const authError = await requireApiAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const { appId, appName, platform, logoUrl, limit = 100, country = 'tr' } = body;

    if (!appId || !appName || !platform) {
      return NextResponse.json({ error: 'appId, appName, and platform are required' }, { status: 400 });
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return NextResponse.json({
        error: 'Supabase configuration is missing in environment variables. Please check your .env.local file.',
      }, { status: 500 });
    }

    if (platform !== 'android' && platform !== 'ios') {
      return NextResponse.json({ error: 'Invalid platform. Must be ios or android' }, { status: 400 });
    }

    const targetCount = Math.min(Math.max(Number(limit) || 100, 1), 1000);
    const existingStoreReviewIds = await getExistingStoreReviewIds(supabaseAdmin, appId, platform);

    let collection;
    try {
      collection = await collectNewReviews({
        platform,
        appId,
        country,
        targetCount,
        existingIds: existingStoreReviewIds,
      });
    } catch (err) {
      console.error(`${platform} scraping error:`, err);
      const label = platform === 'android' ? 'Google Play Store' : 'App Store';
      return NextResponse.json({ error: `${label} review scraping failed: ${err.message}` }, { status: 500 });
    }

    const { reviews: reviewsToSave } = collection;

    if (reviewsToSave.length === 0) {
      return NextResponse.json({
        error: collection.fetchedCount > 0
          ? 'Mağazada daha fazla yeni yorum bulunamadı; kazınanların tamamı zaten kayıtlı.'
          : 'Bu uygulama için yorum bulunamadı.',
        fetchedCount: collection.fetchedCount,
        skippedCount: collection.skippedCount,
        requestedCount: targetCount,
      }, { status: 409 });
    }

    const { data: analysis, error: analysisError } = await supabaseAdmin
      .from('apps_analysis')
      .insert([
        {
          app_id: appId,
          app_name: appName,
          platform,
          logo_url: logoUrl || '',
          total_reviews_scraped: reviewsToSave.length,
          status: 'scraped',
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (analysisError) {
      console.error('Supabase apps_analysis insert error:', analysisError);
      return NextResponse.json({ error: `Database insert failed: ${analysisError.message}. Make sure you created the database tables.` }, { status: 500 });
    }

    const reviewsToInsert = reviewsToSave.map((r) => ({
      analysis_id: analysis.id,
      store_review_id: r.storeReviewId,
      user_name: r.userName,
      rating: r.rating,
      comment: r.comment,
      date: r.date,
    }));

    const batchSize = 200;
    for (let i = 0; i < reviewsToInsert.length; i += batchSize) {
      const batch = reviewsToInsert.slice(i, i + batchSize);
      const { error: reviewsError } = await supabaseAdmin.from('reviews').insert(batch);

      if (reviewsError) {
        console.error('Supabase reviews insert error at batch:', i, reviewsError);
        await supabaseAdmin.from('apps_analysis').delete().eq('id', analysis.id);
        return NextResponse.json({ error: `Database reviews insert failed: ${reviewsError.message}` }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      analysisId: analysis.id,
      scrapedCount: reviewsToSave.length,
      requestedCount: targetCount,
      fetchedCount: collection.fetchedCount,
      skippedCount: collection.skippedCount,
      skippedExisting: collection.skippedExisting,
      skippedInBatch: collection.skippedInBatch,
      partial: collection.partial,
    });
  } catch (error) {
    console.error('Scrape API General Error:', error);
    return NextResponse.json({ error: `Internal server error: ${error.message}` }, { status: 500 });
  }
}
