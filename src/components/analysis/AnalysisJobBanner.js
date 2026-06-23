'use client';

import Link from 'next/link';
import { Loader2, Sparkles, CheckCircle2, Clock } from 'lucide-react';
import { useAnalysisProgress } from '@/context/AnalysisProgressProvider';
import styles from './AnalysisJobBanner.module.css';

export default function AnalysisJobBanner() {
  const { processingJobs, recentlyCompleted } = useAnalysisProgress();

  if (processingJobs.length === 0 && recentlyCompleted.length === 0) {
    return null;
  }

  return (
    <div className={styles.wrapper}>
      {processingJobs.map((job) => {
        const progress = job.analysis_progress;
        const isQueued = job.status === 'queued' || progress?.phase === 'queued';
        const percent = progress?.percent ?? 0;
        const message =
          progress?.message ||
          (isQueued ? 'Sırada bekliyor...' : 'AI analizi devam ediyor...');

        return (
          <div key={job.id} className={styles.banner}>
            <div className={styles.bannerHeader}>
              {isQueued ? (
                <Clock size={16} className={styles.queueIcon} />
              ) : (
                <Loader2 size={16} className={styles.spinner} />
              )}
              <div className={styles.bannerText}>
                <strong>{job.app_name}</strong> — {message}
              </div>
              <Link href={`/analysis/${job.id}`} className={styles.bannerLink}>
                Detay
              </Link>
            </div>
            {!isQueued && (
              <>
                <div className={styles.progressTrack}>
                  <div className={styles.progressFill} style={{ width: `${percent}%` }} />
                </div>
                <div className={styles.progressMeta}>
                  <span>
                    {progress?.phase === 'chunks' && progress?.chunks
                      ? `Parça ${Math.min(progress.current, progress.chunks)}/${progress.chunks}`
                      : progress?.phase === 'synthesis'
                        ? 'Birleştirme'
                        : progress?.phase === 'saving'
                          ? 'Kaydediliyor'
                          : 'Başlatılıyor'}
                  </span>
                  <span>%{percent}</span>
                </div>
              </>
            )}
          </div>
        );
      })}

      {recentlyCompleted.map((job) => (
        <div key={`done-${job.id}`} className={`${styles.banner} ${styles.bannerDone}`}>
          <CheckCircle2 size={16} />
          <div className={styles.bannerText}>
            <strong>{job.app_name}</strong> analizi tamamlandı.
          </div>
          <Link href={`/analysis/${job.id}`} className={styles.bannerLink}>
            <Sparkles size={14} />
            Raporu Gör
          </Link>
        </div>
      ))}
    </div>
  );
}
