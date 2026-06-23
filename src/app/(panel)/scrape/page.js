'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Loader2,
  AlertCircle,
  Sparkles,
  Globe,
  Hash,
  Download,
  MessageSquare,
  Layers,
  Smartphone,
  ExternalLink,
} from 'lucide-react';
import PlatformBadge from '@/components/store/PlatformBadge';
import { StoreLogo } from '@/components/store/StoreLogos';
import { getStoreUrl } from '@/lib/storeUrl';
import styles from './page.module.css';

export default function ScrapePage() {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState('search');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);

  const [manualAppId, setManualAppId] = useState('');
  const [manualAppName, setManualAppName] = useState('');
  const [manualPlatform, setManualPlatform] = useState('android');
  const [manualLogoUrl, setManualLogoUrl] = useState('');

  const [limit, setLimit] = useState(250);
  const [country, setCountry] = useState('tr');

  const [isScraping, setIsScraping] = useState(false);
  const [scrapingAppName, setScrapingAppName] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSearch = async (event) => {
    event.preventDefault();
    if (!searchTerm.trim()) return;

    setIsSearching(true);
    setErrorMessage('');
    setSearchResults([]);
    setHasSearched(true);

    try {
      const response = await fetch(`/api/search?term=${encodeURIComponent(searchTerm)}`);
      const data = await response.json();

      if (response.ok) {
        setSearchResults(data.apps || []);
        if (data.apps.length === 0) {
          setErrorMessage('Aradığınız kritere uygun uygulama bulunamadı.');
        }
      } else {
        setErrorMessage(data.error || 'Arama sırasında bir hata oluştu.');
      }
    } catch (error) {
      console.error(error);
      setErrorMessage('Arama servisine erişilemedi.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleScrape = async (app) => {
    setIsScraping(true);
    setScrapingAppName(app.title || app.appName);
    setErrorMessage('');

    try {
      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: app.appId,
          appName: app.title || app.appName,
          platform: app.platform,
          logoUrl: app.icon || app.logoUrl || '',
          limit: Number(limit),
          country,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        const skipped = data.skippedCount || 0;
        const params = new URLSearchParams();
        params.set('new', String(data.scrapedCount));
        if (skipped > 0) params.set('skipped', String(skipped));
        if (data.requestedCount) params.set('requested', String(data.requestedCount));
        if (data.partial) params.set('partial', '1');
        router.push(`/analysis/${data.analysisId}?${params.toString()}`);
      } else {
        setErrorMessage(data.error || 'Yorumlar kazınırken bir hata oluştu.');
        setIsScraping(false);
      }
    } catch (error) {
      console.error(error);
      setErrorMessage('Yorum kazıma servisiyle iletişim kurulamadı.');
      setIsScraping(false);
    }
  };

  const handleManualScrape = (event) => {
    event.preventDefault();

    if (!manualAppId.trim() || !manualAppName.trim()) {
      setErrorMessage('Uygulama ID ve Uygulama Adı zorunludur.');
      return;
    }

    handleScrape({
      appId: manualAppId.trim(),
      appName: manualAppName.trim(),
      platform: manualPlatform,
      logoUrl: manualLogoUrl.trim(),
    });
  };

  return (
    <div className={styles.page}>
      {isScraping && (
        <div className={styles.loadingOverlay}>
          <div className={styles.loadingBox}>
            <Loader2 className={styles.loadingSpinner} size={48} />
            <h3>Yorumlar kazınıyor</h3>
            <p>
              <strong>{scrapingAppName}</strong> için mağazadan yeni yorumlar toplanıyor.
              Daha önce kayıtlı olanlar otomatik atlanır.
            </p>
            <div className={styles.loadingMeta}>
              <MessageSquare size={14} />
              {limit} yeni yorum · {country.toUpperCase()}
            </div>
          </div>
        </div>
      )}

      <header className={styles.hero}>
        <div className={styles.heroIcon}>
          <Sparkles size={24} />
        </div>
        <h1>Yeni Yorum Analizi</h1>
        <p>
          App Store veya Google Play&apos;den uygulama seçin, yorumları kazıyın ve ardından
          Gemini ile AI analizi başlatın.
        </p>
        <div className={styles.steps}>
          <span className={styles.step}>
            <span className={styles.stepNum}>1</span>
            Uygulama seç
          </span>
          <span className={styles.step}>
            <span className={styles.stepNum}>2</span>
            Yorumları kazı
          </span>
          <span className={styles.step}>
            <span className={styles.stepNum}>3</span>
            AI analizi
          </span>
        </div>
      </header>

      {errorMessage && (
        <div className={styles.errorBox}>
          <AlertCircle size={18} />
          <span>{errorMessage}</span>
        </div>
      )}

      <section className={`glass-card ${styles.mainCard}`}>
        <div className={styles.configGrid}>
          <div className={styles.configItem}>
            <label className={styles.configLabel} htmlFor="limit">
              <Layers size={14} />
              Yeni yorum hedefi
            </label>
            <select
              id="limit"
              className="form-select w-full"
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value))}
            >
              <option value={100}>100 yeni yorum</option>
              <option value={250}>250 yeni yorum</option>
              <option value={500}>500 yeni yorum</option>
              <option value={1000}>1000 yeni yorum</option>
            </select>
          </div>

          <div className={styles.configItem}>
            <label className={styles.configLabel} htmlFor="country">
              <Globe size={14} />
              Mağaza bölgesi
            </label>
            <select
              id="country"
              className="form-select w-full"
              value={country}
              onChange={(event) => setCountry(event.target.value)}
            >
              <option value="tr">Türkiye (TR)</option>
              <option value="us">Amerika (US)</option>
              <option value="gb">Birleşik Krallık (GB)</option>
              <option value="de">Almanya (DE)</option>
              <option value="fr">Fransa (FR)</option>
            </select>
          </div>
        </div>

        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'search' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('search')}
          >
            <Search size={16} />
            Mağazada Ara
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'manual' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('manual')}
          >
            <Hash size={16} />
            ID ile Ekle
          </button>
        </div>

        {activeTab === 'search' && (
          <div>
            <form onSubmit={handleSearch}>
              <div className={styles.searchWrap}>
                <Search size={18} className={styles.searchIcon} />
                <input
                  type="text"
                  placeholder="Uygulama adı — Spotify, WhatsApp, Trendyol..."
                  className={styles.searchInput}
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </div>
              <div className={styles.searchActions}>
                <button type="submit" className="btn btn-primary" disabled={isSearching}>
                  {isSearching ? (
                    <Loader2 className={styles.loadingSpinner} size={16} />
                  ) : (
                    <Search size={16} />
                  )}
                  Uygulama Ara
                </button>
              </div>
              <p className={styles.searchHint}>
                Hem App Store hem Google Play sonuçları birlikte listelenir.
              </p>
            </form>

            {searchResults.length > 0 && (
              <>
                <div className={styles.resultsHeader}>
                  <span>{searchResults.length} sonuç bulundu</span>
                </div>
                <div className={styles.resultsGrid}>
                  {searchResults.map((app, index) => (
                    <div key={`${app.platform}-${app.appId}-${index}`} className={styles.appCard}>
                      <div className={styles.appInfo}>
                      <div className={styles.scrapeAppIconWrap}>
                        {app.icon ? (
                          <img src={app.icon} alt={app.title} className={styles.scrapeAppIcon} />
                        ) : (
                          <div className={styles.scrapeAppIconPlaceholder}>App</div>
                        )}
                      </div>
                        <div className={styles.appDetails}>
                          <h4>{app.title}</h4>
                          <p>{app.developer}</p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                            <PlatformBadge platform={app.platform} />
                            <a
                              href={getStoreUrl(app.platform, app.appId)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={styles.miniStoreLink}
                              title="Mağaza sayfasına git"
                            >
                              <ExternalLink size={10} />
                              Mağaza
                            </a>
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        className={styles.scrapeBtn}
                        onClick={() => handleScrape(app)}
                      >
                        <Download size={15} />
                        Yorumları Çek
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {hasSearched && !isSearching && searchResults.length === 0 && !errorMessage && (
              <div className={styles.emptyResults}>
                <Search size={40} strokeWidth={1.5} />
                <h3>Sonuç bulunamadı</h3>
                <p>Farklı bir anahtar kelime deneyin veya ID ile ekle sekmesini kullanın.</p>
              </div>
            )}

            {!hasSearched && (
              <div className={styles.emptyResults}>
                <Smartphone size={40} strokeWidth={1.5} />
                <h3>Uygulama arayın</h3>
                <p>Analiz etmek istediğiniz uygulamanın adını yukarıya yazın.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'manual' && (
          <form onSubmit={handleManualScrape} className={styles.manualForm}>
            <div className={styles.formGroup}>
              <label htmlFor="manualAppId">Uygulama ID / Paket Adı</label>
              <input
                id="manualAppId"
                type="text"
                placeholder="com.spotify.music veya 389801252"
                className="form-input"
                value={manualAppId}
                onChange={(event) => setManualAppId(event.target.value)}
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="manualAppName">Uygulama Adı</label>
              <input
                id="manualAppName"
                type="text"
                placeholder="Spotify"
                className="form-input"
                value={manualAppName}
                onChange={(event) => setManualAppName(event.target.value)}
              />
            </div>

            <div className={styles.formGroup}>
              <label>Platform</label>
              <div className={styles.platformPicker}>
                <button
                  type="button"
                  className={`${styles.platformOption} ${
                    manualPlatform === 'android' ? styles.platformOptionActive : ''
                  }`}
                  onClick={() => setManualPlatform('android')}
                >
                  <span className={`${styles.platformOptionIcon} ${styles.platformOptionIconPlay}`}>
                    <StoreLogo platform="android" size={22} />
                  </span>
                  <span className={styles.platformOptionText}>
                    <strong>Google Play</strong>
                    <span>Paket adı · com.ornek.app</span>
                  </span>
                </button>
                <button
                  type="button"
                  className={`${styles.platformOption} ${
                    manualPlatform === 'ios' ? styles.platformOptionActive : ''
                  }`}
                  onClick={() => setManualPlatform('ios')}
                >
                  <span className={`${styles.platformOptionIcon} ${styles.platformOptionIconAppStore}`}>
                    <StoreLogo platform="ios" size={22} />
                  </span>
                  <span className={styles.platformOptionText}>
                    <strong>App Store</strong>
                    <span>Numeric app ID</span>
                  </span>
                </button>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="manualLogoUrl">Logo URL (opsiyonel)</label>
              <input
                id="manualLogoUrl"
                type="url"
                placeholder="https://...png"
                className="form-input"
                value={manualLogoUrl}
                onChange={(event) => setManualLogoUrl(event.target.value)}
              />
            </div>

            <button type="submit" className={`btn btn-primary w-full ${styles.submitBtn}`}>
              <Download size={18} />
              Yorum Kazımayı Başlat
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
