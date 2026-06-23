'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Sparkles, AlertCircle, PlusCircle, Loader2, Search } from 'lucide-react';
import AiReportList from '@/components/AiReportList';
import { useAnalysisProgress } from '@/context/AnalysisProgressProvider';
import styles from '@/styles/panel.module.css';

export default function ReportsPage() {
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [platformFilter, setPlatformFilter] = useState('all');
  const { processingJobs } = useAnalysisProgress();

  const fetchReports = async () => {
    setIsLoading(true);
    setErrorMessage('');

    try {
      const response = await fetch('/api/history', { cache: 'no-store' });
      const data = await response.json();

      if (response.ok) {
        setHistory(data.history || []);
      } else {
        setErrorMessage(data.error || 'Raporlar yüklenemedi.');
      }
    } catch (error) {
      console.error(error);
      setErrorMessage('Sunucuya bağlanılamadı.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  useEffect(() => {
    if (processingJobs.length === 0) return undefined;

    const interval = setInterval(fetchReports, 10000);
    return () => clearInterval(interval);
  }, [processingJobs.length]);

  const reports = useMemo(
    () => history.filter((item) => item.status === 'analyzed'),
    [history]
  );

  const filteredReports = useMemo(() => {
    return reports.filter((item) => {
      const matchesSearch = item.app_name?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesPlatform = platformFilter === 'all' || item.platform === platformFilter;
      return matchesSearch && matchesPlatform;
    });
  }, [reports, searchTerm, platformFilter]);

  const processingReports = useMemo(() => {
    const fromHistory = history.filter(
      (item) => item.status === 'processing' || item.status === 'queued'
    );
    const historyIds = new Set(fromHistory.map((item) => item.id));

    for (const job of processingJobs) {
      if (!historyIds.has(job.id)) {
        fromHistory.push(job);
      }
    }

    return fromHistory;
  }, [history, processingJobs]);

  const pendingCount = useMemo(
    () => history.filter((item) => item.status === 'scraped').length,
    [history]
  );

  return (
    <div>
      {errorMessage && (
        <div className={styles.errorBox}>
          <AlertCircle size={18} />
          <span>{errorMessage}</span>
        </div>
      )}

      {!isLoading && processingReports.length > 0 && (
        <section className={`glass-card ${styles.processingSection}`}>
          <h2 className={styles.panelTitle}>
            <Loader2 size={18} className={styles.processingTitleSpinner} />
            Devam Eden Analizler ({processingReports.length})
          </h2>
          <div className={styles.processingReportList}>
            {processingReports.map((item) => {
              const progress = item.analysis_progress;
              const percent = progress?.percent ?? 0;

              return (
                <Link
                  key={item.id}
                  href={`/analysis/${item.id}`}
                  className={styles.processingReportCard}
                >
                  <div className={styles.processingReportHeader}>
                    <strong>{item.app_name}</strong>
                    <span>%{percent}</span>
                  </div>
                  <div className={styles.processingTrack}>
                    <div
                      className={styles.processingFill}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <p className={styles.processingReportMessage}>
                    {progress?.message || 'AI analizi devam ediyor...'}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {!isLoading && pendingCount > 0 && (
        <div className={styles.infoBanner}>
          <Sparkles size={18} />
          <div>
            <strong>{pendingCount} kayıt</strong> henüz AI analizi bekliyor. Geçmiş sayfasından
            detaya girip &quot;AI Analizini Başlat&quot; butonunu kullanabilirsiniz.
          </div>
        </div>
      )}

      <section className="glass-card">
        <div className={styles.reportPageHeader}>
          <div>
            <h2 className={styles.panelTitle} style={{ marginBottom: '0.35rem' }}>
              <Sparkles size={18} className="text-primary" />
              AI Raporları ({isLoading ? '...' : (searchTerm || platformFilter !== 'all' ? `${filteredReports.length} / ${reports.length}` : reports.length)})
            </h2>
            <p className={styles.reportPageDesc}>
              Gemini tarafından analiz edilmiş uygulamaların özet raporları. Tam rapor için karta
              tıklayın.
            </p>
          </div>
          {!isLoading && reports.length === 0 && processingReports.length === 0 && (
            <Link href="/scrape" className="btn btn-primary">
              <PlusCircle size={16} />
              Yeni Analiz
            </Link>
          )}
        </div>

        {/* Filter Bar */}
        {!isLoading && reports.length > 0 && (
          <div className={styles.filterBar}>
            <div className={styles.searchContainer}>
              <Search size={16} className={styles.searchIcon} />
              <input
                type="text"
                placeholder="Raporlarda ara (Uygulama adı)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '2.5rem' }}
              />
            </div>
            <div className={styles.platformFilterGroup}>
              <button
                type="button"
                className={`${styles.filterBtn} ${platformFilter === 'all' ? styles.filterBtnActive : ''}`}
                onClick={() => setPlatformFilter('all')}
              >
                Hepsi
              </button>
              <button
                type="button"
                className={`${styles.filterBtn} ${platformFilter === 'ios' ? styles.filterBtnActive : ''}`}
                onClick={() => setPlatformFilter('ios')}
              >
                App Store
              </button>
              <button
                type="button"
                className={`${styles.filterBtn} ${platformFilter === 'android' ? styles.filterBtnActive : ''}`}
                onClick={() => setPlatformFilter('android')}
              >
                Google Play
              </button>
            </div>
          </div>
        )}

        <AiReportList
          reports={filteredReports}
          isLoading={isLoading}
          emptyMessage={
            searchTerm || platformFilter !== 'all'
              ? 'Aradığınız kriterlere uygun AI raporu bulunamadı.'
              : 'Henüz tamamlanmış bir AI raporu yok. Önce yorum kazıyın, ardından analiz detay sayfasından AI analizini başlatın.'
          }
        />
      </section>
    </div>
  );
}
