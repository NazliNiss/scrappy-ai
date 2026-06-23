export function extractStoreReviewId(rawReview) {
  const id = rawReview?.id;
  if (id === undefined || id === null || id === '') {
    return null;
  }
  return String(id);
}

export async function getExistingStoreReviewIds(supabase, appId, platform) {
  const { data: analyses, error: analysesError } = await supabase
    .from('apps_analysis')
    .select('id')
    .eq('app_id', appId)
    .eq('platform', platform);

  if (analysesError) {
    throw new Error(`Mevcut analizler okunamadı: ${analysesError.message}`);
  }

  if (!analyses?.length) {
    return new Set();
  }

  const analysisIds = analyses.map((item) => item.id);
  const { data: reviews, error: reviewsError } = await supabase
    .from('reviews')
    .select('store_review_id')
    .in('analysis_id', analysisIds)
    .not('store_review_id', 'is', null);

  if (reviewsError) {
    throw new Error(`Mevcut yorumlar okunamadı: ${reviewsError.message}`);
  }

  return new Set((reviews || []).map((review) => review.store_review_id));
}

export function dedupeNormalizedReviews(reviews, existingIds) {
  const seen = new Set(existingIds);
  const unique = [];
  let skippedExisting = 0;
  let skippedInBatch = 0;

  for (const review of reviews) {
    const storeReviewId = review.storeReviewId;

    if (!storeReviewId) {
      unique.push(review);
      continue;
    }

    if (seen.has(storeReviewId)) {
      if (existingIds.has(storeReviewId)) {
        skippedExisting += 1;
      } else {
        skippedInBatch += 1;
      }
      continue;
    }

    seen.add(storeReviewId);
    unique.push(review);
  }

  return {
    unique,
    skippedExisting,
    skippedInBatch,
    skippedTotal: skippedExisting + skippedInBatch,
  };
}
