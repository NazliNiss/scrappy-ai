'use client';

import { useRouter } from 'next/navigation';
import {
  Sparkles,
  Loader2,
  ChevronRight,
  MessageSquare,
} from 'lucide-react';
import PlatformBadge from '@/components/store/PlatformBadge';
import badgeStyles from '@/components/store/PlatformBadge.module.css';
import styles from '@/styles/panel.module.css';

export default function AiReportList({ reports, isLoading, emptyMessage }) {
  const router = useRouter();

  if (isLoading) {
    return (
      <div className={styles.loadingCenter}>
        <Loader2 className={styles.loadingSpinner} size={32} />
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className={styles.emptyState}>
        <Sparkles className={styles.emptyIcon} size={40} />
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={styles.reportGrid}>
      {reports.map((item) => {
        const positive = item.sentiment_distribution?.positive || 0;
        const neutral = item.sentiment_distribution?.neutral || 0;
        const negative = item.sentiment_distribution?.negative || 0;

        return (
          <article
            key={item.id}
            className={styles.reportCard}
            onClick={() => router.push(`/analysis/${item.id}`)}
          >
            <div className={styles.reportCardHeader}>
              <div className={styles.historyAppMeta}>
                <div className={styles.listAppIconWrap}>
                  {item.logo_url ? (
                    <img src={item.logo_url} alt={item.app_name} className={styles.listAppIcon} />
                  ) : (
                    <div className={styles.listAppIconPlaceholder}>App</div>
                  )}
                </div>
                <div className={styles.historyInfo}>
                  <h4>{item.app_name}</h4>
                  <PlatformBadge platform={item.platform} className={badgeStyles.inList} />
                  <p className={styles.historyDate}>
                    {new Date(item.created_at).toLocaleDateString('tr-TR')} ·{' '}
                    {item.total_reviews_scraped} yorum
                  </p>
                </div>
              </div>
              <ChevronRight size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            </div>

            <div className={styles.reportSentimentRow}>
              <span className={styles.reportSentimentLabel}>
                <MessageSquare size={14} />
                Duygu Dağılımı
              </span>
              <div className={styles.reportSentimentStats}>
                <span className={styles.sentimentStatPos}>%{positive} olumlu</span>
                <span className={styles.sentimentStatNeu}>%{neutral} nötr</span>
                <span className={styles.sentimentStatNeg}>%{negative} olumsuz</span>
              </div>
              <div className={styles.sentimentMinichart} style={{ width: '100%', marginTop: '0.5rem' }}>
                <div className={styles.sentimentBarPos} style={{ width: `${positive}%` }} />
                <div className={styles.sentimentBarNeu} style={{ width: `${neutral}%` }} />
                <div className={styles.sentimentBarNeg} style={{ width: `${negative}%` }} />
              </div>
            </div>

            {item.ai_summary && (
              <p className={styles.reportSummary}>{item.ai_summary}</p>
            )}

            <div className={styles.reportCardFooter}>
              <span className={styles.reportTag}>
                <Sparkles size={12} />
                AI Raporu
              </span>
              <span className={styles.reportLinkHint}>Detayı görüntüle</span>
            </div>
          </article>
        );
      })}
    </div>
  );
}
