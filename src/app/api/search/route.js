import { NextResponse } from 'next/server';
import gplay from 'google-play-scraper';
import store from 'app-store-scraper';
import { requireApiAuth } from '@/lib/apiAuth';

export async function GET(request) {
  const authError = await requireApiAuth(request);
  if (authError) return authError;
  const { searchParams } = new URL(request.url);
  const term = searchParams.get('term');

  if (!term || term.trim() === '') {
    return NextResponse.json({ error: 'Search term is required' }, { status: 400 });
  }

  // Run searches in parallel
  const [androidResults, iosResults] = await Promise.allSettled([
    gplay.search({ term, num: 8 }),
    store.search({ term, num: 8 })
  ]);

  const apps = [];

  // Parse Android (Google Play) results
  if (androidResults.status === 'fulfilled' && Array.isArray(androidResults.value)) {
    androidResults.value.forEach(app => {
      apps.push({
        appId: app.appId, // e.g. com.spotify.music
        title: app.title,
        developer: app.developer,
        icon: app.icon,
        platform: 'android',
        score: app.score || 0,
        url: app.url
      });
    });
  } else if (androidResults.status === 'rejected') {
    console.error('Google Play Search Error:', androidResults.reason);
  }

  // Parse iOS (App Store) results
  if (iosResults.status === 'fulfilled' && Array.isArray(iosResults.value)) {
    iosResults.value.forEach(app => {
      apps.push({
        appId: String(app.id), // e.g. 389801252 (comes as number from API)
        title: app.title,
        developer: app.developer,
        icon: app.icon,
        platform: 'ios',
        score: app.score || 0,
        url: app.url
      });
    });
  } else if (iosResults.status === 'rejected') {
    console.error('App Store Search Error:', iosResults.reason);
  }

  return NextResponse.json({ apps });
}
