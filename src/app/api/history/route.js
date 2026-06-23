import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/apiAuth';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { maintainAnalysisQueue } from '@/lib/runAnalysisJob';

export async function GET(request) {
  const authError = await requireApiAuth(request);
  if (authError) return authError;

  try {
    // Check if Supabase keys are provided
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return NextResponse.json({ 
        error: 'Supabase configuration is missing. Please configure your .env.local file.' 
      }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const scope = searchParams.get('scope');

    if (scope === 'processing') {
      await maintainAnalysisQueue();

      const { data: processing, error: processingError } = await supabaseAdmin
        .from('apps_analysis')
        .select(
          'id, app_id, app_name, platform, logo_url, status, analysis_progress, total_reviews_scraped, created_at'
        )
        .in('status', ['processing', 'queued'])
        .order('created_at', { ascending: false });

      if (processingError) {
        console.error('Fetch processing jobs error:', processingError);
        return NextResponse.json(
          { error: `Database error: ${processingError.message}` },
          { status: 500 }
        );
      }

      return NextResponse.json({ history: processing || [] });
    }

    if (id) {
      // Fetch single analysis
      const { data: analysis, error: analysisError } = await supabaseAdmin
        .from('apps_analysis')
        .select('*')
        .eq('id', id)
        .single();

      if (analysisError || !analysis) {
        console.error('Fetch analysis detail error:', analysisError);
        return NextResponse.json({ error: 'Analysis record not found' }, { status: 404 });
      }

      // Fetch associated reviews
      const { data: reviews, error: reviewsError } = await supabaseAdmin
        .from('reviews')
        .select('*')
        .eq('analysis_id', id)
        .order('date', { ascending: false });

      if (reviewsError) {
        console.error('Fetch analysis reviews error:', reviewsError);
        return NextResponse.json({ error: 'Failed to fetch reviews' }, { status: 500 });
      }

      return NextResponse.json({ analysis, reviews: reviews || [] });
    }

    // Otherwise fetch list of all analyses
    const { data: history, error: historyError } = await supabaseAdmin
      .from('apps_analysis')
      .select('*')
      .order('created_at', { ascending: false });

    if (historyError) {
      console.error('Fetch history list error:', historyError);
      return NextResponse.json({ error: `Database error: ${historyError.message}` }, { status: 500 });
    }

    return NextResponse.json({ history: history || [] });

  } catch (error) {
    console.error('History API GET Error:', error);
    return NextResponse.json({ error: `Internal server error: ${error.message}` }, { status: 500 });
  }
}

export async function DELETE(request) {
  const authError = await requireApiAuth(request);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id parameter is required' }, { status: 400 });
    }

    // Delete analysis record (will cascade delete associated reviews)
    const { error } = await supabaseAdmin
      .from('apps_analysis')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Delete history error:', error);
      return NextResponse.json({ error: `Database error: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('History API DELETE Error:', error);
    return NextResponse.json({ error: `Internal server error: ${error.message}` }, { status: 500 });
  }
}
