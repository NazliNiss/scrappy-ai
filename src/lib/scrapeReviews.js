import gplay from 'google-play-scraper';
import store from 'app-store-scraper';
import { extractStoreReviewId } from '@/lib/reviewDedup';

const ANDROID_PAGE_SIZE = 150;
const IOS_MAX_PAGES = 10;
const ABSOLUTE_MAX_FETCH = 5000;

export function normalizeRawReview(rawReview) {
  let rDate = new Date();
  if (rawReview.date) {
    rDate = new Date(rawReview.date);
  } else if (rawReview.updated) {
    rDate = new Date(rawReview.updated);
  }

  return {
    storeReviewId: extractStoreReviewId(rawReview),
    userName: rawReview.userName || 'Anonymous',
    rating:
      rawReview.score !== undefined
        ? rawReview.score
        : rawReview.rating !== undefined
          ? rawReview.rating
          : 0,
    comment: rawReview.text || rawReview.comment || '',
    date: Number.isNaN(rDate.getTime()) ? new Date().toISOString() : rDate.toISOString(),
  };
}

function createCollector(existingIds, targetCount) {
  const seen = new Set(existingIds);
  const newReviews = [];
  const stats = {
    skippedExisting: 0,
    skippedInBatch: 0,
    fetchedTotal: 0,
  };

  const maxFetch = Math.min(Math.max(targetCount * 20, targetCount + 100), ABSOLUTE_MAX_FETCH);

  const addRawReview = (rawReview) => {
    stats.fetchedTotal += 1;
    const review = normalizeRawReview(rawReview);
    const storeReviewId = review.storeReviewId;

    if (storeReviewId && seen.has(storeReviewId)) {
      if (existingIds.has(storeReviewId)) {
        stats.skippedExisting += 1;
      } else {
        stats.skippedInBatch += 1;
      }
      return false;
    }

    if (storeReviewId) {
      seen.add(storeReviewId);
    }

    newReviews.push(review);
    return true;
  };

  const isComplete = () =>
    newReviews.length >= targetCount || stats.fetchedTotal >= maxFetch;

  return { newReviews, stats, maxFetch, addRawReview, isComplete };
}

async function collectAndroidReviews(appId, country, targetCount, existingIds) {
  const collector = createCollector(existingIds, targetCount);
  let nextToken = null;

  while (!collector.isComplete()) {
    const result = await gplay.reviews({
      appId,
      lang: country === 'tr' ? 'tr' : 'en',
      country,
      sort: gplay.sort.NEWEST,
      num: ANDROID_PAGE_SIZE,
      paginate: false,
      nextPaginationToken: nextToken,
    });

    const batch = result.data || [];
    if (batch.length === 0) {
      break;
    }

    for (const rawReview of batch) {
      collector.addRawReview(rawReview);
      if (collector.newReviews.length >= targetCount) {
        break;
      }
    }

    nextToken = result.nextPaginationToken;
    if (!nextToken) {
      break;
    }
  }

  return collector;
}

async function collectIosReviews(appId, country, targetCount, existingIds) {
  const collector = createCollector(existingIds, targetCount);

  for (let page = 1; page <= IOS_MAX_PAGES && !collector.isComplete(); page += 1) {
    const pageReviews = await store.reviews({
      id: appId,
      country,
      page,
      sort: store.sort.RECENT,
    });

    if (!pageReviews || pageReviews.length === 0) {
      break;
    }

    for (const rawReview of pageReviews) {
      collector.addRawReview(rawReview);
      if (collector.newReviews.length >= targetCount) {
        break;
      }
    }

    if (pageReviews.length < 50) {
      break;
    }
  }

  return collector;
}

export async function collectNewReviews({
  platform,
  appId,
  country,
  targetCount,
  existingIds,
}) {
  const collector =
    platform === 'android'
      ? await collectAndroidReviews(appId, country, targetCount, existingIds)
      : await collectIosReviews(appId, country, targetCount, existingIds);

  const { newReviews, stats } = collector;
  const skippedTotal = stats.skippedExisting + stats.skippedInBatch;

  return {
    reviews: newReviews.slice(0, targetCount),
    requestedCount: targetCount,
    fetchedCount: stats.fetchedTotal,
    skippedCount: skippedTotal,
    skippedExisting: stats.skippedExisting,
    skippedInBatch: stats.skippedInBatch,
    partial: newReviews.length < targetCount,
    exhausted: newReviews.length < targetCount,
  };
}
