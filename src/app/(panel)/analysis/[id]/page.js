'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import * as XLSX from 'xlsx';
import styles from './page.module.css';
import AnalysisProgressBar from '@/components/analysis/AnalysisProgressBar';
import {
  mergeAnalysisWithLiveStatus,
  useAnalysisDetailPolling,
  useAnalysisProgress,
} from '@/context/AnalysisProgressProvider';
import { 
  ArrowLeft, 
  Loader2, 
  AlertTriangle, 
  FileSpreadsheet, 
  Bug, 
  Lightbulb, 
  Search, 
  MessageSquare,
  AlertCircle,
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  ExternalLink,
} from 'lucide-react';
import PlatformBadge from '@/components/store/PlatformBadge';
import badgeStyles from '@/components/store/PlatformBadge.module.css';
import { getStoreUrl } from '@/lib/storeUrl';

export default function AnalysisDetail({ params: paramsPromise }) {
  const params = React.use(paramsPromise);
  const id = params.id;
  const searchParams = useSearchParams();

  const scrapeInfo = useMemo(() => {
    const skipped = Number.parseInt(searchParams.get('skipped') || '', 10);
    const added = Number.parseInt(searchParams.get('new') || '', 10);
    const requested = Number.parseInt(searchParams.get('requested') || '', 10);
    const partial = searchParams.get('partial') === '1';

    if (!Number.isFinite(added) || added <= 0) return null;

    return {
      skipped: Number.isFinite(skipped) ? skipped : 0,
      added,
      requested: Number.isFinite(requested) ? requested : null,
      partial,
    };
  }, [searchParams]);

  const [isLoading, setIsLoading] = useState(true);
  const [analysis, setAnalysis] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [sentimentFilter, setSentimentFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date'); // 'date' | 'rating'
  const [sortOrder, setSortOrder] = useState('desc'); // 'asc' | 'desc'
  
  const [isStarting, setIsStarting] = useState(false);
  const [aiError, setAiError] = useState('');
  const { processingJobs, refreshProcessingJobs, trackAnalysisJob } = useAnalysisProgress();
  const processingJobsRef = useRef(processingJobs);
  processingJobsRef.current = processingJobs;

  // Table state
  const [tableSearch, setTableSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const reviewsPerPage = 10;

  const fetchDetails = useCallback(async (showSpinner = true) => {
    if (showSpinner) setIsLoading(true);
    setAiError('');
    try {
      const res = await fetch(`/api/history?id=${id}`, { cache: 'no-store' });
      const data = await res.json();
      
      if (res.ok) {
        const contextJob = processingJobsRef.current.find((job) => job.id === id);
        const liveRes = await fetch(`/api/analyze?analysisId=${id}`, { cache: 'no-store' });
        const liveData = liveRes.ok ? await liveRes.json() : null;

        const mergedAnalysis = mergeAnalysisWithLiveStatus(
          data.analysis,
          liveData,
          contextJob
        );

        setAnalysis(mergedAnalysis);
        setReviews(data.reviews || []);

        if (mergedAnalysis?.status === 'failed' && mergedAnalysis?.analysis_error) {
          setAiError(mergedAnalysis.analysis_error);
        }
      } else {
        setAiError(data.error || 'Veriler yüklenemedi.');
      }
    } catch (err) {
      console.error(err);
      setAiError('Sunucu bağlantısı kurulamadı.');
    } finally {
      if (showSpinner) setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      fetchDetails(true);
    }
  }, [id, fetchDetails]);

  const handleProgressUpdate = useCallback(
    async (data) => {
      setAnalysis((prev) => {
        if (!prev) return prev;

        const nextStatus =
          data.status === 'queued' || data.isQueued
            ? 'queued'
            : data.status === 'processing' || data.isRunning
              ? 'processing'
              : data.status;

        return {
          ...prev,
          status: nextStatus,
          analysis_progress: data.progress ?? prev.analysis_progress,
          analysis_error: data.error ?? prev.analysis_error,
        };
      });

      if (data.status === 'analyzed' && !data.isRunning) {
        await fetchDetails(false);
        refreshProcessingJobs();
      }

      if (data.status === 'failed' && !data.isRunning) {
        setAiError(data.error || 'AI analizi başarısız oldu.');
        refreshProcessingJobs();
      }
    },
    [fetchDetails, refreshProcessingJobs]
  );

  useAnalysisDetailPolling(id, handleProgressUpdate);

  useEffect(() => {
    const contextJob = processingJobs.find((job) => job.id === id);
    if (!contextJob) return;

    setAnalysis((prev) => {
      if (!prev || prev.status === 'analyzed') return prev;

      const currentPercent = prev.analysis_progress?.percent ?? 0;
      const contextPercent = contextJob.analysis_progress?.percent ?? 0;

      // Stale context data should not overwrite newer progress polled locally
      if (contextPercent < currentPercent && prev.status === 'processing') {
        return prev;
      }

      return {
        ...prev,
        status: 'processing',
        analysis_progress: contextJob.analysis_progress || prev.analysis_progress,
      };
    });
  }, [id, processingJobs]);

  const handleStartAiAnalysis = async () => {
    setIsStarting(true);
    setAiError('');
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysisId: id }),
      });
      
      const data = await res.json();
      if (res.status === 202 && (data.started || data.queued || data.alreadyRunning || data.alreadyQueued)) {
        if (data.queued || data.alreadyQueued) {
          const queuedProgress = {
            phase: 'queued',
            queuePosition: data.queuePosition,
            current: 0,
            total: 1,
            percent: 0,
            message: data.message || 'Sırada bekliyor...',
          };

          setAnalysis((prev) =>
            prev
              ? {
                  ...prev,
                  status: 'queued',
                  analysis_progress: queuedProgress,
                  analysis_error: null,
                }
              : prev
          );

          trackAnalysisJob({
            id,
            app_name: analysis?.app_name || data.appName || 'Analiz',
            platform: analysis?.platform,
            logo_url: analysis?.logo_url,
            status: 'queued',
            analysis_progress: queuedProgress,
          });
        } else {
          const initialProgress = {
            phase: 'starting',
            current: 0,
            total: 1,
            percent: 0,
            message: 'Analiz arka planda başlatıldı...',
          };

          setAnalysis((prev) =>
            prev
              ? {
                  ...prev,
                  status: 'processing',
                  analysis_progress: initialProgress,
                  analysis_error: null,
                }
              : prev
          );

          trackAnalysisJob({
            id,
            app_name: analysis?.app_name || data.appName || 'Analiz',
            platform: analysis?.platform,
            logo_url: analysis?.logo_url,
            analysis_progress: initialProgress,
          });
        }
      } else {
        setAiError(data.error || 'AI analizi başlatılırken bir sorun oluştu.');
      }
    } catch (err) {
      console.error(err);
      setAiError('Yapay zeka servisine bağlanırken bir hata oluştu.');
    } finally {
      setIsStarting(false);
    }
  };

  // Export reviews to Excel (.xlsx)
  const handleExportExcel = () => {
    if (reviews.length === 0) return;

    const exportData = reviews.map(r => ({
      'Kullanıcı Adı': r.user_name || 'Anonim',
      'Yıldız Puanı': r.rating,
      'Kullanıcı Yorumu': r.comment,
      'Yazılma Tarihi': new Date(r.date).toLocaleDateString('tr-TR') + ' ' + new Date(r.date).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      'Duygu Analizi (AI)': r.sentiment ? (
        r.sentiment === 'positive' ? 'Olumlu' : r.sentiment === 'negative' ? 'Olumsuz' : 'Nötr'
      ) : 'Analiz Edilmedi'
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Uygulama Yorumları');
    
    // Set column widths dynamically for readability
    const max_widths = [
      { wch: 18 }, // username
      { wch: 12 }, // rating
      { wch: 80 }, // comment
      { wch: 18 }, // date
      { wch: 18 }  // sentiment
    ];
    worksheet['!cols'] = max_widths;

    // Write file
    const fileName = `${analysis.app_name.replace(/[^a-zA-Z0-9]/g, '_')}_yorum_analizi.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  // Filter reviews locally based on search bar and sentiment filter
  const filteredReviews = reviews.filter(r => {
    const matchesSearch = 
      r.user_name?.toLowerCase().includes(tableSearch.toLowerCase()) ||
      r.comment?.toLowerCase().includes(tableSearch.toLowerCase());
      
    const matchesSentiment = 
      sentimentFilter === 'all' || 
      r.sentiment === sentimentFilter;
      
    return matchesSearch && matchesSentiment;
  });

  // Sort reviews based on user selection
  const sortedReviews = useMemo(() => {
    return [...filteredReviews].sort((a, b) => {
      let valA = a[sortBy];
      let valB = b[sortBy];

      if (sortBy === 'date') {
        valA = new Date(valA).getTime();
        valB = new Date(valB).getTime();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredReviews, sortBy, sortOrder]);

  // Pagination index calculation
  const indexOfLastReview = currentPage * reviewsPerPage;
  const indexOfFirstReview = indexOfLastReview - reviewsPerPage;
  const currentReviews = sortedReviews.slice(indexOfFirstReview, indexOfLastReview);
  const totalPages = Math.ceil(filteredReviews.length / reviewsPerPage);

  const handlePageChange = (pageNumber) => {
    setCurrentPage(pageNumber);
  };

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setCurrentPage(1);
  };

  const renderSortIcon = (field) => {
    if (sortBy !== field) return <span style={{ opacity: 0.3, fontSize: '0.8rem', marginLeft: '4px' }}>↕</span>;
    return sortOrder === 'asc' 
      ? <span style={{ color: 'var(--primary)', fontSize: '0.8rem', marginLeft: '4px' }}>▲</span>
      : <span style={{ color: 'var(--primary)', fontSize: '0.8rem', marginLeft: '4px' }}>▼</span>;
  };

  const highlightText = (text, search) => {
    if (!search || !search.trim()) return text;

    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedSearch})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, index) => 
      regex.test(part) ? (
        <mark 
          key={index} 
          style={{ 
            backgroundColor: 'rgba(234, 179, 8, 0.25)', 
            color: 'inherit', 
            borderRadius: '2px', 
            padding: '0 2px' 
          }}
        >
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  const contextJob = processingJobs.find((job) => job.id === id);
  const isQueued =
    analysis?.status === 'queued' ||
    contextJob?.status === 'queued' ||
    analysis?.analysis_progress?.phase === 'queued';

  const isProcessing =
    !isQueued &&
    (analysis?.status === 'processing' ||
      processingJobs.some((job) => job.id === id && job.status !== 'queued'));

  const isActiveAnalysis = isProcessing || isQueued;

  const activeProgress =
    analysis?.analysis_progress ||
    contextJob?.analysis_progress;

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
        <Loader2 className={styles.aiLoadingSpinner} size={48} />
        <p className="mt-4 text-secondary">Veriler yükleniyor...</p>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div>
        <div className={styles.aiPromptBox} style={{ borderColor: 'rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.02)' }}>
          <AlertCircle className="text-danger" size={48} />
          <h2 className="mt-4">Analiz Kaydı Bulunamadı</h2>
          <p className="mt-2">İstediğiniz analiz kaydı mevcut değil veya silinmiş olabilir.</p>
          <Link href="/history" className="btn btn-primary mt-4">
            Geçmişe Dön
          </Link>
        </div>
      </div>
    );
  }

  // Calculate SVG Donut Chart parameters if analyzed
  let positive = 0, neutral = 0, negative = 0;
  let circumference = 251.3; // 2 * PI * r (r=40)
  let posStroke = 0, neuStroke = 0, negStroke = 0;
  let posOffset = -90;
  let neuOffset = -90;
  let negOffset = -90;

  if (analysis.status === 'analyzed' && analysis.sentiment_distribution) {
    positive = analysis.sentiment_distribution.positive || 0;
    neutral = analysis.sentiment_distribution.neutral || 0;
    negative = analysis.sentiment_distribution.negative || 0;

    posStroke = (positive / 100) * circumference;
    neuStroke = (neutral / 100) * circumference;
    negStroke = (negative / 100) * circumference;

    neuOffset = -90 + (positive / 100) * 360;
    negOffset = -90 + ((positive + neutral) / 100) * 360;
  }

  return (
    <div>
      <div className={styles.topNav}>
        <Link href="/history" className={styles.backLink}>
          <ArrowLeft size={16} /> Geçmişe Dön
        </Link>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {analysis.status === 'analyzed' && (
            <button 
              type="button" 
              className="btn btn-secondary"
              onClick={handleStartAiAnalysis}
              disabled={isStarting}
              title="Yorumları yapay zeka ile yeniden analiz et"
            >
              {isStarting ? <Loader2 className={styles.aiLoadingSpinner} size={16} /> : <Sparkles size={16} className="text-primary" />}
              Yeniden Analiz Et
            </button>
          )}
          {reviews.length > 0 && (
            <button 
              type="button" 
              className="btn btn-secondary" 
              onClick={handleExportExcel}
            >
              <FileSpreadsheet size={16} className="text-primary" />
              Excel Olarak İndir
            </button>
          )}
        </div>
      </div>

      {/* App Main Header Info */}
      <section className={styles.appHeader}>
        <div className={styles.appIconWrap}>
          {analysis.logo_url ? (
            <img src={analysis.logo_url} alt={analysis.app_name} className={styles.appIcon} />
          ) : (
            <div className={styles.appIconPlaceholder}>App</div>
          )}
        </div>
        <div className={styles.appMeta}>
          <h1>{analysis.app_name}</h1>
          <div className={styles.appSub}>
            <PlatformBadge platform={analysis.platform} className={badgeStyles.inHeader} />
            <a 
              href={getStoreUrl(analysis.platform, analysis.app_id)} 
              target="_blank" 
              rel="noopener noreferrer" 
              className={styles.storeLink}
              title="Uygulamanın mağaza adresine git"
            >
              <ExternalLink size={12} />
              Mağazaya Git
            </a>
            <span className={styles.scrapedCount}>
              {analysis.total_reviews_scraped} Yorum Kazındı ({new Date(analysis.created_at).toLocaleDateString('tr-TR')})
            </span>
          </div>
        </div>
      </section>

      {/* Scrape dedup info */}
      {scrapeInfo && (
        <div className={styles.scrapeInfoBox}>
          <Sparkles size={18} />
          <p>
            {scrapeInfo.partial && scrapeInfo.requested ? (
              <>
                İstenen <strong>{scrapeInfo.requested}</strong> yeni yorumdan{' '}
                <strong>{scrapeInfo.added}</strong> tanesi kaydedildi (mağazada daha fazla yeni yorum kalmadı).{' '}
              </>
            ) : (
              <>
                <strong>{scrapeInfo.added} yeni yorum</strong> kaydedildi.{' '}
              </>
            )}
            {scrapeInfo.skipped > 0 ? (
              <>
                <strong>{scrapeInfo.skipped} yorum</strong> daha önce kayıtlı olduğu için atlandı.
              </>
            ) : null}
          </p>
        </div>
      )}

      {/* Error Banner */}
      {aiError && (
        <div className={styles.aiPromptBox} style={{ borderColor: 'rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.02)', padding: '2rem', marginBottom: '2rem' }}>
          <AlertCircle className="text-danger" size={24} />
          <h4 className="mt-2 text-danger">İşlem Sırasında Hata Oluştu</h4>
          <p className="mt-1" style={{ fontSize: '0.9rem', marginBottom: 0 }}>{aiError}</p>
        </div>
      )}

      {/* Case: AI processing in background */}
      {isActiveAnalysis && (
        <AnalysisProgressBar
          progress={activeProgress}
          appName={analysis.app_name}
          status={isQueued ? 'queued' : 'processing'}
        />
      )}

      {/* Case: Scraped but AI NOT triggered yet */}
      {!isActiveAnalysis && analysis.status === 'scraped' && (
        <section className={styles.aiPromptBox}>
          <Sparkles className={styles.aiPromptIcon} size={48} />
          <h2>Yapay Zeka Analizi Bekliyor</h2>
          <p>
            Bu uygulamanın yorumları başarıyla kazındı. Gemini Yapay Zekasını çalıştırarak olumlu/olumsuz duygu oranlarını hesaplayabilir, hata listelerini ve yeni özellik taleplerini özet halinde alabilirsiniz.
          </p>
          <button 
            type="button" 
            className={styles.btnAiTrigger}
            onClick={handleStartAiAnalysis}
            disabled={isStarting}
          >
            {isStarting ? <Loader2 className={styles.aiLoadingSpinner} size={18} /> : <Sparkles size={18} />}
            {isStarting ? 'Başlatılıyor...' : 'AI Analizini Başlat'}
          </button>
        </section>
      )}

      {/* Case: Failed — retry */}
      {!isActiveAnalysis && analysis.status === 'failed' && (
        <section className={styles.aiPromptBox} style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}>
          <AlertCircle className="text-danger" size={48} />
          <h2>Analiz Başarısız Oldu</h2>
          <p>{analysis.analysis_error || 'Bilinmeyen bir hata oluştu.'}</p>
          <button 
            type="button" 
            className={styles.btnAiTrigger}
            onClick={handleStartAiAnalysis}
            disabled={isStarting}
          >
            {isStarting ? <Loader2 className={styles.aiLoadingSpinner} size={18} /> : <Sparkles size={18} />}
            Tekrar Dene
          </button>
        </section>
      )}

      {/* Case: AI analysis has completed - Render Dashboard */}
      {analysis.status === 'analyzed' && (
        <div className={styles.dashboardGrid}>
          
          {/* AI General Summary Widget */}
          <section className={`glass-card ${styles.fullRow}`}>
            <h3 className={styles.cardTitle}>
              <Sparkles size={18} className="text-primary" />
              Yapay Zeka Genel Analiz Özeti
            </h3>
            <p className={styles.summaryText}>{analysis.ai_summary}</p>
          </section>

          {/* Sentiment Distribution Ring Chart */}
          <section className="glass-card">
            <h3 className={styles.cardTitle}>
              <MessageSquare size={18} className="text-primary" />
              Duygu Analizi Dağılımı
            </h3>
            <div className={styles.chartLayout}>
              <div className={styles.chartContainer}>
                <svg width="140" height="140" viewBox="0 0 100 100">
                  {/* Background Circle */}
                  <circle cx="50" cy="50" r="40" fill="transparent" stroke="var(--border-color)" strokeWidth="10" />
                  
                  {/* Positive Slice */}
                  {positive > 0 && (
                    <circle 
                      cx="50" cy="50" r="40" 
                      fill="transparent" 
                      stroke="var(--sentiment-pos)" 
                      strokeWidth="10"
                      strokeDasharray={`${posStroke} ${circumference}`}
                      strokeDashoffset="0"
                      transform={`rotate(${posOffset} 50 50)`}
                    />
                  )}
                  
                  {/* Neutral Slice */}
                  {neutral > 0 && (
                    <circle 
                      cx="50" cy="50" r="40" 
                      fill="transparent" 
                      stroke="var(--sentiment-neu)" 
                      strokeWidth="10"
                      strokeDasharray={`${neuStroke} ${circumference}`}
                      transform={`rotate(${neuOffset} 50 50)`}
                    />
                  )}
                  
                  {/* Negative Slice */}
                  {negative > 0 && (
                    <circle 
                      cx="50" cy="50" r="40" 
                      fill="transparent" 
                      stroke="var(--sentiment-neg)" 
                      strokeWidth="10"
                      strokeDasharray={`${negStroke} ${circumference}`}
                      transform={`rotate(${negOffset} 50 50)`}
                    />
                  )}
                </svg>
                <div className={styles.chartLabelCenter}>
                  <div className={styles.chartVal}>%{positive}</div>
                  <div className={styles.chartSub}>Olumlu</div>
                </div>
              </div>

              <div className={styles.chartLegends}>
                <div className={styles.legendItem}>
                  <span className={styles.legendLabel}>
                    <span className={`${styles.legendDot} ${styles.dotPos}`} />
                    Olumlu Yorumlar
                  </span>
                  <span className={styles.legendValue}>%{positive}</span>
                </div>
                <div className={styles.legendItem}>
                  <span className={styles.legendLabel}>
                    <span className={`${styles.legendDot} ${styles.dotNeu}`} />
                    Nötr Yorumlar
                  </span>
                  <span className={styles.legendValue}>%{neutral}</span>
                </div>
                <div className={styles.legendItem}>
                  <span className={styles.legendLabel}>
                    <span className={`${styles.legendDot} ${styles.dotNeg}`} />
                    Olumsuz Yorumlar
                  </span>
                  <span className={styles.legendValue}>%{negative}</span>
                </div>
              </div>
            </div>
          </section>

          {/* Öne Çıkan Olumlu Yönler */}
          <section className="glass-card">
            <h3 className={styles.cardTitle}>
              <ThumbsUp size={18} className="text-success" />
              Öne Çıkan Olumlu Yönler (Neden Sevilmiş?)
            </h3>
            {analysis.ai_positives && analysis.ai_positives.length > 0 ? (
              <ul className={styles.bulletList}>
                {analysis.ai_positives.map((pos, index) => (
                  <li key={`pos-${index}`} className={styles.bulletItem}>
                    <ThumbsUp size={14} className={styles.bulletIcon} style={{ color: 'var(--sentiment-pos)' }} />
                    <span>{pos}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-secondary" style={{ fontSize: '0.9rem' }}>Yapay zeka yorumlarda belirgin bir olumlu yön listelemedi.</p>
            )}
          </section>

          {/* Eksik veya Beğenilmeyen Özellikler */}
          <section className="glass-card">
            <h3 className={styles.cardTitle}>
              <ThumbsDown size={18} style={{ color: '#ef4444' }} />
              Beğenilmeyen veya Eksik Görülen Özellikler
            </h3>
            {analysis.ai_negatives && analysis.ai_negatives.length > 0 ? (
              <ul className={styles.bulletList}>
                {analysis.ai_negatives.map((neg, index) => (
                  <li key={`neg-${index}`} className={styles.bulletItem}>
                    <ThumbsDown size={14} className={styles.bulletIcon} style={{ color: '#ef4444' }} />
                    <span>{neg}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-secondary" style={{ fontSize: '0.9rem' }}>Yapay zeka yorumlarda beğenilmeyen veya eksik bir durum listelemedi.</p>
            )}
          </section>

          {/* Sık Yaşanan Hatalar (Bugs) */}
          <section className="glass-card">
            <h3 className={styles.cardTitle}>
              <Bug size={18} className="text-danger" />
              En Sık Yaşanan Teknik Hatalar (Bugs)
            </h3>
            {analysis.ai_bugs && analysis.ai_bugs.length > 0 ? (
              <ul className={styles.bulletList}>
                {analysis.ai_bugs.map((bug, index) => (
                  <li key={`bug-${index}`} className={styles.bulletItem}>
                    <AlertTriangle size={14} className={`${styles.bulletIcon} ${styles.bugIcon}`} />
                    <span>{bug}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-secondary" style={{ fontSize: '0.9rem' }}>Yapay zeka yorumlarda belirgin bir teknik hata raporlamadı.</p>
            )}
          </section>

          {/* İstenen Özellikler (Feature Requests) */}
          <section className="glass-card">
            <h3 className={styles.cardTitle}>
              <Lightbulb size={18} style={{ color: '#eab308' }} />
              Kullanıcılardan Gelen Özellik Talepleri
            </h3>
            {analysis.ai_features && analysis.ai_features.length > 0 ? (
              <ul className={styles.bulletList}>
                {analysis.ai_features.map((feature, index) => (
                  <li key={`feat-${index}`} className={styles.bulletItem}>
                    <Lightbulb size={14} className={`${styles.bulletIcon} ${styles.featureIcon}`} />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-secondary" style={{ fontSize: '0.9rem' }}>Yapay zeka yorumlarda belirgin bir özellik talebi tespit etmedi.</p>
            )}
          </section>
        </div>
      )}

      {/* Raw Reviews List Table Section */}
      <section className={styles.reviewsSection}>
        <div className={styles.reviewsHeader}>
          <h2>Tüm Yorumlar ({filteredReviews.length} Listeleniyor)</h2>
          
          {analysis.status === 'analyzed' && (
            <div className={styles.sentimentFilterGroup}>
              <button 
                type="button" 
                className={`${styles.filterBtn} ${sentimentFilter === 'all' ? styles.filterBtnActive : ''}`}
                onClick={() => { setSentimentFilter('all'); setCurrentPage(1); }}
              >
                Hepsi ({reviews.length})
              </button>
              <button 
                type="button" 
                className={`${styles.filterBtn} ${styles.filterBtnPos} ${sentimentFilter === 'positive' ? styles.filterBtnActivePos : ''}`}
                onClick={() => { setSentimentFilter('positive'); setCurrentPage(1); }}
              >
                Olumlu ({reviews.filter(r => r.sentiment === 'positive').length})
              </button>
              <button 
                type="button" 
                className={`${styles.filterBtn} ${styles.filterBtnNeu} ${sentimentFilter === 'neutral' ? styles.filterBtnActiveNeu : ''}`}
                onClick={() => { setSentimentFilter('neutral'); setCurrentPage(1); }}
              >
                Nötr ({reviews.filter(r => r.sentiment === 'neutral').length})
              </button>
              <button 
                type="button" 
                className={`${styles.filterBtn} ${styles.filterBtnNeg} ${sentimentFilter === 'negative' ? styles.filterBtnActiveNeg : ''}`}
                onClick={() => { setSentimentFilter('negative'); setCurrentPage(1); }}
              >
                Olumsuz ({reviews.filter(r => r.sentiment === 'negative').length})
              </button>
            </div>
          )}

          <div className={styles.tableSearchInput}>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Yorumlarda ara..."
                className="form-input"
                style={{ paddingLeft: '2.2rem' }}
                value={tableSearch}
                onChange={(e) => {
                  setTableSearch(e.target.value);
                  setCurrentPage(1); // Reset page to 1 on search change
                }}
              />
              <Search size={14} style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            </div>
          </div>
        </div>

        {filteredReviews.length === 0 ? (
          <div className="glass-card text-center" style={{ padding: '3rem 1rem' }}>
            <p className="text-secondary">Aradığınız kelimeyi içeren bir yorum bulunamadı.</p>
          </div>
        ) : (
          <>
            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Kullanıcı</th>
                    <th 
                      onClick={() => handleSort('rating')} 
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                      title="Puana göre sıralamak için tıklayın"
                    >
                      Puan {renderSortIcon('rating')}
                    </th>
                    <th>Yorum</th>
                    {analysis.status === 'analyzed' && <th>AI Duygu</th>}
                    <th 
                      onClick={() => handleSort('date')} 
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                      title="Tarihe göre sıralamak için tıklayın"
                    >
                      Tarih {renderSortIcon('date')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {currentReviews.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: '500', fontSize: '0.85rem' }}>{r.user_name}</td>
                      <td>
                        <div className={styles.ratingStars}>
                          {Array.from({ length: 5 }).map((_, i) => (
                            <span 
                              key={i} 
                              style={{ color: i < r.rating ? '#fbbf24' : 'var(--border-color-hover)' }}
                            >
                              ★
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className={styles.commentText}>{highlightText(r.comment, tableSearch)}</td>
                      {analysis.status === 'analyzed' && (
                        <td>
                          {r.sentiment ? (
                            <span className={`badge ${
                              r.sentiment === 'positive' ? 'badge-pos' : 
                              r.sentiment === 'negative' ? 'badge-neg' : 'badge-neu'
                            }`}>
                              {r.sentiment === 'positive' ? 'Olumlu' : r.sentiment === 'negative' ? 'Olumsuz' : 'Nötr'}
                            </span>
                          ) : (
                            <span className="badge" style={{ background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-secondary)' }}>
                              Hesaplanmadı
                            </span>
                          )}
                        </td>
                      )}
                      <td className={styles.dateCol}>
                        {new Date(r.date).toLocaleDateString('tr-TR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination UI */}
            {totalPages > 1 && (
              <div className={styles.pagination}>
                <span>Sayfa {currentPage} / {totalPages}</span>
                <div className={styles.paginationBtns}>
                  <button 
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                    disabled={currentPage === 1}
                    onClick={() => handlePageChange(currentPage - 1)}
                  >
                    Önceki
                  </button>
                  <button 
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                    disabled={currentPage === totalPages}
                    onClick={() => handlePageChange(currentPage + 1)}
                  >
                    Sonraki
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
