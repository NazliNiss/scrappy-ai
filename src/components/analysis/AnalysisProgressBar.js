'use client';

import { Clock, Loader2, Check } from 'lucide-react';
import styles from './AnalysisProgressBar.module.css';

export default function AnalysisProgressBar({ progress, appName, status = 'processing' }) {
  const isQueued = status === 'queued' || progress?.phase === 'queued';
  const percent = progress?.percent ?? 0;
  const message =
    progress?.message ||
    (isQueued
      ? 'Başka bir analiz bitince otomatik başlayacak...'
      : 'Yapay zeka yorumları analiz ediyor...');

  const phase = progress?.phase || 'starting';

  const steps = [
    {
      id: 'prep',
      label: 'Veri Hazırlığı',
      description: 'Yorumlar derleniyor ve model limitleri doğrulanıyor.',
      isCompleted: ['chunks', 'synthesis', 'saving', 'done'].includes(phase),
      isActive: phase === 'starting',
    },
    {
      id: 'chunks',
      label: 'Yorumların Yapay Zekayla Analizi',
      description: progress?.chunks 
        ? `Kullanıcı geri bildirimleri ${progress.chunks} parça halinde işleniyor (${progress.current || 0}/${progress.chunks}).`
        : 'Duygular ve teknik hatalar analiz ediliyor.',
      isCompleted: ['synthesis', 'saving', 'done'].includes(phase),
      isActive: phase === 'chunks',
    },
    {
      id: 'synthesis',
      label: 'Sentez & Rapor Oluşturma',
      description: 'Tüm parça analizleri birleştirilip tek bir özet rapora dönüştürülüyor.',
      isCompleted: ['saving', 'done'].includes(phase),
      isActive: phase === 'synthesis',
    },
    {
      id: 'saving',
      label: 'Veritabanı Güncellemesi',
      description: 'Analiz sonuçları veritabanına kaydedilip tamamlandı statüsü veriliyor.',
      isCompleted: phase === 'done',
      isActive: phase === 'saving',
    },
  ];

  return (
    <section className={`glass-card ${styles.progressCard}`}>
      <div className={styles.progressHeader}>
        {isQueued ? (
          <Clock size={24} className={styles.queueIcon} />
        ) : (
          <Loader2 size={24} className={styles.spinner} />
        )}
        <h3>
          {appName} — {isQueued ? 'Sırada Bekliyor' : 'AI Analizi Devam Ediyor'}
        </h3>
      </div>

      {!isQueued && (
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${percent}%` }} />
        </div>
      )}

      <div className={styles.progressMeta}>
        <span>
          {isQueued
            ? progress?.queuePosition
              ? `${progress.queuePosition}. sırada`
              : 'Kuyrukta'
            : progress?.phase === 'chunks' && progress?.chunks
              ? `Parça ${Math.min(progress.current, progress.chunks)}/${progress.chunks}`
              : progress?.phase === 'synthesis'
                ? 'Sonuçlar birleştiriliyor'
                : progress?.phase === 'saving'
                  ? 'Veritabanına kaydediliyor'
                  : 'Hazırlanıyor'}
        </span>
        {!isQueued && <span>%{percent}</span>}
      </div>

      {!isQueued && (
        <div className={styles.stepsList}>
          {steps.map((step) => (
            <div
              key={step.id}
              className={`${styles.stepRow} ${
                step.isCompleted ? styles.stepCompleted : ''
              } ${step.isActive ? styles.stepActive : ''}`}
            >
              <div
                className={`${styles.stepIndicator} ${
                  step.isCompleted
                    ? styles.indicatorCompleted
                    : step.isActive
                      ? styles.indicatorActive
                      : styles.indicatorPending
                }`}
              >
                {step.isCompleted ? (
                  <Check size={14} />
                ) : step.isActive ? (
                  <Loader2 size={12} className={styles.spinner} />
                ) : null}
              </div>
              <div className={styles.stepInfo}>
                <div className={styles.stepLabel}>{step.label}</div>
                <div className={styles.stepDesc}>{step.description}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className={styles.progressMessage}>{message}</p>

      <p className={styles.progressHint}>
        {isQueued
          ? 'Aynı anda yalnızca bir AI analizi çalışır. Sıranız gelince analiz otomatik başlar.'
          : 'Analiz arka planda çalışıyor. Başka sayfaya geçebilirsiniz; üstteki banner veya bu sayfa ilerlemeyi güncellemeye devam eder.'}
      </p>
    </section>
  );
}
