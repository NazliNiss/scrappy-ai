'use client';

import { useEffect, useState, useMemo } from 'react';
import { History, AlertCircle, Search } from 'lucide-react';
import HistoryList from '@/components/HistoryList';
import { useAnalysisProgress } from '@/context/AnalysisProgressProvider';
import styles from '@/styles/panel.module.css';

export default function HistoryPage() {
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [platformFilter, setPlatformFilter] = useState('all');
  const { processingJobs } = useAnalysisProgress();

  const fetchHistory = async (showLoader = true) => {
    if (showLoader) setIsLoading(true);
    setErrorMessage('');

    try {
      const response = await fetch('/api/history', { cache: 'no-store' });
      const data = await response.json();

      if (response.ok) {
        setHistory(data.history || []);
      } else {
        setErrorMessage(data.error || 'Geçmiş veriler yüklenemedi.');
      }
    } catch (error) {
      console.error(error);
      setErrorMessage('Veritabanına bağlanılamadı.');
    } finally {
      if (showLoader) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  useEffect(() => {
    if (processingJobs.length === 0) return undefined;

    const interval = setInterval(() => fetchHistory(false), 10000);
    return () => clearInterval(interval);
  }, [processingJobs.length]);

  const filteredHistory = useMemo(() => {
    return history.filter((item) => {
      const matchesSearch = item.app_name?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesPlatform = platformFilter === 'all' || item.platform === platformFilter;
      return matchesSearch && matchesPlatform;
    });
  }, [history, searchTerm, platformFilter]);

  const handleDeleteHistory = async (id, event) => {
    event.stopPropagation();

    if (!confirm('Bu analizi ve kazınmış tüm yorumları silmek istediğinizden emin misiniz?')) {
      return;
    }

    setErrorMessage('');

    try {
      const response = await fetch(`/api/history?id=${id}`, { method: 'DELETE' });

      if (response.ok) {
        setHistory((items) => items.filter((item) => item.id !== id));
      } else {
        const data = await response.json();
        setErrorMessage(data.error || 'Silme işlemi başarısız.');
      }
    } catch (error) {
      console.error(error);
      setErrorMessage('Silme işlemi sırasında sunucu hatası oluştu.');
    }
  };

  return (
    <div>
      {errorMessage && (
        <div className={styles.errorBox}>
          <AlertCircle size={18} />
          <span>{errorMessage}</span>
        </div>
      )}

      <section className="glass-card">
        <h2 className={styles.panelTitle}>
          <History size={18} className="text-primary" />
          Tüm Analizler ({isLoading ? '...' : (searchTerm || platformFilter !== 'all' ? `${filteredHistory.length} / ${history.length}` : history.length)})
        </h2>

        {/* Filter Bar */}
        {!isLoading && history.length > 0 && (
          <div className={styles.filterBar}>
            <div className={styles.searchContainer}>
              <Search size={16} className={styles.searchIcon} />
              <input
                type="text"
                placeholder="Analizlerde ara (Uygulama adı)..."
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

        <HistoryList
          history={filteredHistory}
          isLoading={isLoading}
          onDelete={handleDeleteHistory}
          emptyMessage={
            searchTerm || platformFilter !== 'all'
              ? 'Aradığınız kriterlere uygun analiz bulunamadı.'
              : 'Henüz kazınmış bir uygulama bulunmuyor. Yeni analiz başlatabilirsiniz.'
          }
        />
      </section>
    </div>
  );
}
