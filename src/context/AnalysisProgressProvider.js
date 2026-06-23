'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

const AnalysisProgressContext = createContext(null);

const POLL_INTERVAL_MS = 10000;

async function fetchLiveAnalysisStatus(analysisId) {
  const res = await fetch(`/api/analyze?analysisId=${analysisId}`, { cache: 'no-store' });
  const data = await res.json();
  if (!res.ok) return null;
  return data;
}

async function fetchProcessingJobs() {
  const res = await fetch('/api/history?scope=processing', { cache: 'no-store' });
  const data = await res.json();
  if (!res.ok) return null;
  return data.history || [];
}

export function mergeAnalysisWithLiveStatus(analysis, liveStatus, contextJob) {
  if (!analysis) return analysis;

  let merged = { ...analysis };

  if (contextJob?.status === 'processing' && analysis.status !== 'analyzed') {
    merged = {
      ...merged,
      status: 'processing',
      analysis_progress: contextJob.analysis_progress || merged.analysis_progress,
    };
  }

  if (!liveStatus) return merged;

  if (liveStatus.status === 'queued' || liveStatus.isQueued) {
    return {
      ...merged,
      status: 'queued',
      analysis_progress: liveStatus.progress || merged.analysis_progress,
      analysis_error: null,
    };
  }

  if (liveStatus.status === 'processing' || liveStatus.isRunning) {
    return {
      ...merged,
      status: 'processing',
      analysis_progress: liveStatus.progress || merged.analysis_progress,
      analysis_error: null,
    };
  }

  if (liveStatus.status === 'failed') {
    return {
      ...merged,
      status: 'failed',
      analysis_error: liveStatus.error || merged.analysis_error,
      analysis_progress: liveStatus.progress,
    };
  }

  if (liveStatus.status === 'analyzed') {
    return {
      ...merged,
      status: 'analyzed',
      analysis_progress: liveStatus.progress,
      analysis_error: null,
    };
  }

  return merged;
}

export function AnalysisProgressProvider({ children }) {
  const [processingJobs, setProcessingJobs] = useState([]);
  const [recentlyCompleted, setRecentlyCompleted] = useState([]);
  const [pollingEnabled, setPollingEnabled] = useState(false);
  const previousProcessingRef = useRef([]);

  const pollProcessingJobs = useCallback(async () => {
    try {
      const processing = await fetchProcessingJobs();
      if (processing === null) return;

      const previous = previousProcessingRef.current;
      const newIds = new Set(processing.map((item) => item.id));
      const completedNow = [];

      for (const prevJob of previous) {
        if (!newIds.has(prevJob.id)) {
          const live = await fetchLiveAnalysisStatus(prevJob.id);
          if (live?.status === 'analyzed') {
            completedNow.push({ ...prevJob, status: 'analyzed' });
          }
        }
      }

      previousProcessingRef.current = processing;
      setProcessingJobs(processing);
      setPollingEnabled(processing.length > 0);

      if (completedNow.length > 0) {
        setRecentlyCompleted((prev) => {
          const merged = [...completedNow, ...prev];
          const seen = new Set();
          return merged
            .filter((item) => {
              if (seen.has(item.id)) return false;
              seen.add(item.id);
              return true;
            })
            .slice(0, 5);
        });
      }
    } catch (error) {
      console.error('Processing jobs poll failed:', error);
    }
  }, []);

  const trackAnalysisJob = useCallback(
    (job) => {
      if (!job?.id) return;

      const optimisticJob = {
        status: 'processing',
        analysis_progress: {
          phase: 'starting',
          current: 0,
          total: 1,
          percent: 0,
          message: 'Analiz arka planda başlatıldı...',
        },
        ...job,
      };

      setPollingEnabled(true);
      setProcessingJobs((prev) => {
        const next = [...prev.filter((item) => item.id !== job.id), optimisticJob];
        previousProcessingRef.current = next;
        return next;
      });

      pollProcessingJobs();
    },
    [pollProcessingJobs]
  );

  useEffect(() => {
    pollProcessingJobs();
  }, [pollProcessingJobs]);

  useEffect(() => {
    if (!pollingEnabled) return undefined;

    const interval = setInterval(pollProcessingJobs, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [pollingEnabled, pollProcessingJobs]);

  useEffect(() => {
    if (recentlyCompleted.length === 0) return undefined;

    const timeout = setTimeout(() => {
      setRecentlyCompleted([]);
    }, 8000);

    return () => clearTimeout(timeout);
  }, [recentlyCompleted]);

  const value = useMemo(
    () => ({
      processingJobs,
      recentlyCompleted,
      refreshProcessingJobs: pollProcessingJobs,
      trackAnalysisJob,
      hasActiveJobs: processingJobs.length > 0,
    }),
    [processingJobs, recentlyCompleted, pollProcessingJobs, trackAnalysisJob]
  );

  return (
    <AnalysisProgressContext.Provider value={value}>
      {children}
    </AnalysisProgressContext.Provider>
  );
}

export function useAnalysisProgress() {
  const context = useContext(AnalysisProgressContext);
  if (!context) {
    throw new Error('useAnalysisProgress must be used within AnalysisProgressProvider');
  }
  return context;
}

export function useAnalysisDetailPolling(analysisId, onUpdate) {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!analysisId) {
      return undefined;
    }

    let cancelled = false;
    let stopped = false;

    const poll = async () => {
      if (cancelled || stopped) return;

      try {
        const data = await fetchLiveAnalysisStatus(analysisId);
        if (!data || cancelled) return;

        onUpdateRef.current(data);

        const shouldStop =
          data.status === 'analyzed' ||
          (data.status === 'failed' && !data.isRunning);

        if (shouldStop) {
          stopped = true;
        }
      } catch (error) {
        console.error('Analysis detail poll failed:', error);
      }
    };

    poll();
    const interval = setInterval(() => {
      if (stopped) {
        clearInterval(interval);
        return;
      }
      poll();
    }, 2500);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [analysisId]);
}
