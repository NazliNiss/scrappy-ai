'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Clock,
  ChevronRight,
  Loader2,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import PlatformBadge from '@/components/store/PlatformBadge';
import badgeStyles from '@/components/store/PlatformBadge.module.css';
import styles from '@/styles/panel.module.css';
import { getStoreUrl } from '@/lib/storeUrl';

function getStatusBadge(item) {
  switch (item.status) {
    case 'analyzed':
      return { label: 'Analiz Edildi', className: styles.statusAnalyzed };
    case 'processing':
      return { label: 'İşleniyor', className: styles.statusProcessing };
    case 'queued':
      return { label: 'Sırada', className: styles.statusQueued };
    case 'failed':
      return { label: 'Başarısız', className: styles.statusFailed };
    default:
      return { label: 'Kazındı', className: styles.statusScraped };
  }
}

export default function HistoryList({
  history,
  isLoading,
  emptyMessage,
  onDelete,
  compact = false,
}) {
  const router = useRouter();
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    if (!compact) {
      const maxPage = Math.max(1, Math.ceil(history.length / itemsPerPage));
      if (currentPage > maxPage) {
        setCurrentPage(maxPage);
      }
    }
  }, [history.length, compact, currentPage, itemsPerPage]);

  if (isLoading) {
    return (
      <div className={styles.loadingCenter}>
        <Loader2 className={styles.loadingSpinner} size={32} />
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className={styles.emptyState}>
        <Clock className={styles.emptyIcon} size={40} />
        <p>{emptyMessage}</p>
      </div>
    );
  }

  const totalPages = Math.ceil(history.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;

  const items = compact 
    ? history.slice(0, 5) 
    : history.slice(indexOfFirstItem, indexOfLastItem);

  return (
    <div className={styles.historyList}>
      {items.map((item) => (
        <div
          key={item.id}
          className={styles.historyCard}
          onClick={() => router.push(`/analysis/${item.id}`)}
        >
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem', marginBottom: '0.25rem' }}>
                <PlatformBadge platform={item.platform} className={badgeStyles.inList} />
                <a
                  href={getStoreUrl(item.platform, item.app_id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) => event.stopPropagation()}
                  className={styles.miniStoreLink}
                  title="Mağaza sayfasına git"
                >
                  <ExternalLink size={10} />
                  Mağaza
                </a>
              </div>
              <p className={styles.historyDate}>
                {new Date(item.created_at).toLocaleDateString('tr-TR')} ·{' '}
                {item.total_reviews_scraped} Yorum
              </p>

              {(item.status === 'processing' || item.status === 'queued') && item.analysis_progress && (
                <div className={styles.processingMini}>
                  <div className={styles.processingTrack}>
                    <div
                      className={styles.processingFill}
                      style={{ width: `${item.analysis_progress.percent || 0}%` }}
                    />
                  </div>
                  <span className={styles.processingLabel}>
                    %{item.analysis_progress.percent || 0} — {item.analysis_progress.message}
                  </span>
                </div>
              )}
              {item.status === 'analyzed' && item.sentiment_distribution && (
                <div className={styles.sentimentMinichart}>
                  <div
                    className={styles.sentimentBarPos}
                    style={{ width: `${item.sentiment_distribution.positive || 0}%` }}
                  />
                  <div
                    className={styles.sentimentBarNeu}
                    style={{ width: `${item.sentiment_distribution.neutral || 0}%` }}
                  />
                  <div
                    className={styles.sentimentBarNeg}
                    style={{ width: `${item.sentiment_distribution.negative || 0}%` }}
                  />
                </div>
              )}
            </div>
          </div>

          <div className={styles.historyActions}>
            {(() => {
              const badge = getStatusBadge(item);
              return (
                <span className={`${styles.historyStatusBadge} ${badge.className}`}>
                  {badge.label}
                </span>
              );
            })()}
            {onDelete && (
              <button
                type="button"
                className="btn btn-danger"
                style={{ padding: '0.5rem' }}
                onClick={(event) => onDelete(item.id, event)}
              >
                <Trash2 size={14} />
              </button>
            )}
            <ChevronRight size={18} style={{ color: 'var(--text-secondary)' }} />
          </div>
        </div>
      ))}

      {/* Pagination Controls */}
      {!compact && totalPages > 1 && (
        <div className={styles.pagination}>
          <span>Sayfa {currentPage} / {totalPages}</span>
          <div className={styles.paginationBtns}>
            <button 
              type="button"
              className="btn btn-secondary"
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(currentPage - 1)}
            >
              Önceki
            </button>
            <button 
              type="button"
              className="btn btn-secondary"
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(currentPage + 1)}
            >
              Sonraki
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
