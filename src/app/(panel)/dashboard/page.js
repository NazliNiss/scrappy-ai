'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  BarChart3,
  CheckCircle2,
  Clock,
  MessageSquare,
  PlusCircle,
  Loader2,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import HistoryList from '@/components/HistoryList';
import styles from '@/styles/panel.module.css';

export default function DashboardPage() {
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    setIsLoading(true);
    setErrorMessage('');

    try {
      const response = await fetch('/api/history');
      const data = await response.json();

      if (response.ok) {
        setHistory(data.history || []);
      } else {
        setErrorMessage(data.error || 'Veriler yüklenemedi.');
      }
    } catch (error) {
      console.error(error);
      setErrorMessage('Sunucuya bağlanılamadı.');
    } finally {
      setIsLoading(false);
    }
  };

  const stats = useMemo(() => {
    const analyzedList = history.filter((item) => item.status === 'analyzed');
    const analyzed = analyzedList.length;
    const scraped = history.filter((item) => item.status === 'scraped').length;
    const totalReviews = history.reduce(
      (sum, item) => sum + (item.total_reviews_scraped || 0),
      0
    );

    // Calculate average satisfaction rate (positive sentiment ratio)
    let averageSatisfaction = 0;
    if (analyzed > 0) {
      const totalPos = analyzedList.reduce(
        (sum, item) => sum + (item.sentiment_distribution?.positive || 0),
        0
      );
      averageSatisfaction = Math.round(totalPos / analyzed);
    }

    const iosCount = history.filter((item) => item.platform === 'ios').length;
    const androidCount = history.filter((item) => item.platform === 'android').length;

    return {
      total: history.length,
      analyzed,
      scraped,
      totalReviews,
      averageSatisfaction,
      iosCount,
      androidCount
    };
  }, [history]);

  return (
    <div>
      {errorMessage && (
        <div className={styles.errorBox}>
          <AlertCircle size={18} />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconPrimary}`}>
            <BarChart3 size={20} />
          </div>
          <div>
            <div className={styles.statLabel}>Toplam Analiz</div>
            <div className={styles.statValue}>{isLoading ? '—' : stats.total}</div>
            {!isLoading && (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
                iOS: {stats.iosCount} | Android: {stats.androidCount}
              </div>
            )}
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconSuccess}`}>
            <CheckCircle2 size={20} />
          </div>
          <div>
            <div className={styles.statLabel}>AI Analiz Oranı</div>
            <div className={styles.statValue}>
              {isLoading ? '—' : `${stats.analyzed} / ${stats.total}`}
            </div>
            {!isLoading && (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
                Bekleyen: {stats.scraped} | Tamamlanma: %{stats.total > 0 ? Math.round((stats.analyzed / stats.total) * 100) : 0}
              </div>
            )}
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconWarning}`} style={{ color: '#eab308', background: 'rgba(234, 179, 8, 0.1)' }}>
            <Sparkles size={20} />
          </div>
          <div>
            <div className={styles.statLabel}>Ort. Memnuniyet</div>
            <div className={styles.statValue}>
              {isLoading ? '—' : stats.analyzed > 0 ? `%${stats.averageSatisfaction}` : '—'}
            </div>
            {!isLoading && (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
                Analizlerin olumlu yorum oranı
              </div>
            )}
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconInfo}`}>
            <MessageSquare size={20} />
          </div>
          <div>
            <div className={styles.statLabel}>Toplam Yorum</div>
            <div className={styles.statValue}>
              {isLoading ? '—' : stats.totalReviews.toLocaleString('tr-TR')}
            </div>
            {!isLoading && (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
                Çekilen ham veri hacmi
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={styles.contentGridTwo}>
        <section className="glass-card">
          <h2 className={styles.panelTitle}>
            <Clock size={18} className="text-primary" />
            Son Aktiviteler
          </h2>

          {isLoading ? (
            <div className={styles.loadingCenter}>
              <Loader2 className={styles.loadingSpinner} size={28} />
            </div>
          ) : (
            <HistoryList
              history={history}
              isLoading={false}
              compact
              emptyMessage="Henüz analiz yok. İlk kazımayı başlatın."
            />
          )}

          {history.length > 5 && (
            <div className={styles.quickActions}>
              <Link href="/history" className="btn btn-secondary">
                Tümünü Gör
              </Link>
            </div>
          )}
        </section>

        <section className="glass-card">
          <h2 className={styles.panelTitle}>
            <PlusCircle size={18} className="text-primary" />
            Hızlı İşlemler
          </h2>

          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
            App Store veya Google Play&apos;den uygulama yorumlarını kazıyın, ardından Gemini
            ile duygu analizi ve özet rapor alın.
          </p>

          <div className={styles.quickActions}>
            <Link href="/scrape" className="btn btn-primary">
              <PlusCircle size={16} />
              Yeni Analiz Başlat
            </Link>
            <Link href="/reports" className="btn btn-secondary">
              AI Raporları
            </Link>
            <Link href="/history" className="btn btn-secondary">
              Geçmişe Git
            </Link>
          </div>

          <div
            style={{
              marginTop: '1.5rem',
              padding: '1rem',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(99, 102, 241, 0.06)',
              border: '1px solid rgba(99, 102, 241, 0.15)',
            }}
          >
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              <strong style={{ color: 'var(--nav-active-text)' }}>İpucu:</strong> AI analizi maliyet tasarrufu
              için kazıma sonrası manuel başlatılır. Detay sayfasından &quot;AI Analizini
              Başlat&quot; butonunu kullanın.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
