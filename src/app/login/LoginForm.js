'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Lock, AlertCircle, Sparkles, User, KeyRound } from 'lucide-react';
import ThemeToggle from '@/components/theme/ThemeToggle';
import styles from './page.module.css';

// React hook for text typing effect with an optional start delay
function useTypingEffect(texts, typingSpeed = 70, deletingSpeed = 35, delayBetween = 2200, startDelay = 0) {
  const [text, setText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [loopNum, setLoopNum] = useState(0);
  const [speed, setSpeed] = useState(typingSpeed);
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    const startTimer = setTimeout(() => {
      setHasStarted(true);
    }, startDelay);
    return () => clearTimeout(startTimer);
  }, [startDelay]);

  useEffect(() => {
    if (!hasStarted) return;

    let timer;
    const handleTyping = () => {
      const i = loopNum % texts.length;
      const fullText = texts[i];

      if (isDeleting) {
        setText(fullText.substring(0, text.length - 1));
        setSpeed(deletingSpeed);
      } else {
        setText(fullText.substring(0, text.length + 1));
        setSpeed(typingSpeed);
      }

      if (!isDeleting && text === fullText) {
        timer = setTimeout(() => setIsDeleting(true), delayBetween);
        return;
      }

      if (isDeleting && text === '') {
        setIsDeleting(false);
        setLoopNum(loopNum + 1);
        setSpeed(typingSpeed);
      }
    };

    timer = setTimeout(handleTyping, speed);
    return () => clearTimeout(timer);
  }, [text, isDeleting, loopNum, speed, texts, typingSpeed, deletingSpeed, delayBetween, hasStarted]);

  return text;
}

// React hook for one-shot typing effect (e.g. for headings)
function useOneShotTyping(text, speed = 60, startDelay = 800) {
  const [displayedText, setDisplayedText] = useState('');
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    let index = 0;
    let timer;

    const startTyping = () => {
      timer = setInterval(() => {
        if (index < text.length) {
          const nextChar = text.charAt(index);
          setDisplayedText((prev) => prev + nextChar);
          index++;
        } else {
          setIsDone(true);
          clearInterval(timer);
        }
      }, speed);
    };

    const delayTimer = setTimeout(startTyping, startDelay);

    return () => {
      clearTimeout(delayTimer);
      clearInterval(timer);
    };
  }, [text, speed, startDelay]);

  return { text: displayedText, isDone };
}

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get('from') || '/dashboard';
  const configError = searchParams.get('error') === 'auth_not_configured';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(
    configError
      ? 'Sunucuda kimlik doğrulama yapılandırılmamış. AUTH_SECRET, AUTH_USERNAME ve AUTH_PASSWORD tanımlayın.'
      : ''
  );

  const slogans = useMemo(() => [
    'Kullanıcı yorumlarını saniyeler içinde kazıyın.',
    'Gemini Yapay Zekası ile duygu analizi yapın.',
    'Teknik hataları ve bugları hızlıca listeleyin.',
    'Yeni özellik isteklerini analiz edin ve keşfedin.',
    'Uygulamanızı veri odaklı olarak geliştirin.'
  ], []);

  // Title typing effect: starts after left column fades in (at 950ms)
  const headingText = 'Uygulama Yorumlarında Yapay Zeka Analizi';
  const { text: typedHeading, isDone: isHeadingDone } = useOneShotTyping(headingText, 45, 950);

  // Slogans typing effect: starts after the heading has finished typing (at ~3200ms)
  const typedText = useTypingEffect(slogans, 70, 35, 2200, 3200);

  const renderTypedHeading = () => {
    const cutoff = 22; // "Uygulama Yorumlarında " is 22 characters long
    if (typedHeading.length <= cutoff) {
      return <span>{typedHeading}</span>;
    }
    const baseText = typedHeading.substring(0, cutoff);
    const gradientText = typedHeading.substring(cutoff);
    return (
      <>
        {baseText} <br />
        <span className={styles.gradientHighlight}>{gradientText}</span>
      </>
    );
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!username.trim() || !password.trim()) {
      setErrorMessage('Kullanıcı adı ve şifre zorunludur.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        router.replace(from.startsWith('/login') ? '/dashboard' : from);
        router.refresh();
        return;
      }

      setErrorMessage(data.error || 'Giriş başarısız.');
    } catch (error) {
      console.error(error);
      setErrorMessage('Giriş servisine ulaşılamadı.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.pageWrap}>
      {/* Background blobs */}
      <div className={styles.bgBlob1}></div>
      <div className={styles.bgBlob2}></div>

      {/* Floating Centered Split Box (The small rectangle) */}
      <div className={styles.splitContainer}>
        {/* Left Column: Branding & Dynamic Slogans */}
        <div className={styles.leftCol}>
          <div className={styles.leftContent}>
            <div className={styles.brandTitle}>
              <Sparkles className={styles.leftBrandIcon} size={28} />
              <span>ScrappyAI</span>
            </div>
            <h2 className={styles.leftHeading}>
              {renderTypedHeading()}
              {!isHeadingDone && <span className={styles.cursor}>|</span>}
            </h2>
            <div className={styles.typingContainer}>
              <span className={styles.typedText}>{typedText}</span>
              <span className={styles.cursor}>|</span>
            </div>
            <p className={styles.leftDesc}>
              App Store ve Google Play Store'daki tüm kullanıcı deneyimlerini tek tıkla analiz edin.
              Kullanıcıların neyi beğendiğini, hangi teknik hatalardan yakındığını ve hangi yeni özellikleri 
              beklediğini anında görün.
            </p>
          </div>
          <div className={styles.leftFooter}>
            © 2026 ScrappyAI Platform. Tüm hakları saklıdır.
          </div>
        </div>

        {/* Right Column: Login Forms */}
        <div className={styles.rightCol}>
          <div className={styles.themeToggleWrap}>
            <ThemeToggle compact />
          </div>
          
          {/* Mobile Header (Shows only on small screens) */}
          <div className={styles.mobileHeader}>
            <Sparkles className={styles.mobileBrandIcon} size={32} />
            <h1 className={styles.mobileTitle}>ScrappyAI</h1>
          </div>

          <h2 className={styles.cardTitle}>Giriş Yap</h2>
          <p className={styles.subtitle}>
            Yorum Kazıma & Analiz Paneli
          </p>

          {errorMessage && (
            <div className={styles.errorBox}>
              <AlertCircle size={18} />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.formGroup}>
              <label htmlFor="username">Kullanıcı Adı</label>
              <div className={styles.inputWrapper}>
                <User size={16} className={styles.inputIcon} />
                <input
                  id="username"
                  type="text"
                  className={styles.loginInput}
                  placeholder="Kullanıcı adı"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  disabled={isLoading || configError}
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="password">Şifre</label>
              <div className={styles.inputWrapper}>
                <KeyRound size={16} className={styles.inputIcon} />
                <input
                  id="password"
                  type="password"
                  className={styles.loginInput}
                  placeholder="Şifreniz"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  disabled={isLoading || configError}
                />
              </div>
            </div>

            <button
              type="submit"
              className={styles.submitBtn}
              disabled={isLoading || configError}
            >
              {isLoading ? <Loader2 className={styles.spinner} size={16} /> : null}
              Giriş Yap
            </button>
          </form>

          <div className={styles.cardFooter}>
            <span>ScrappyAI v1.1.0</span>
            <span className={styles.dotSeparator}>·</span>
            <span>Gemini 1.5 Flash</span>
          </div>
        </div>
      </div>
    </div>
  );
}
