'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  PlusCircle,
  History,
  LogOut,
  Menu,
  X,
  Sparkles,
} from 'lucide-react';
import ThemeToggle from '@/components/theme/ThemeToggle';
import AnalysisJobBanner from '@/components/analysis/AnalysisJobBanner';
import styles from './DashboardLayout.module.css';

const NAV_ITEMS = [
  {
    href: '/dashboard',
    label: 'Genel Bakış',
    icon: LayoutDashboard,
    subtitle: 'Panel özeti ve istatistikler',
  },
  {
    href: '/scrape',
    label: 'Yeni Analiz',
    icon: PlusCircle,
    subtitle: 'Uygulama yorumu kazıma',
  },
  {
    href: '/history',
    label: 'Geçmiş',
    icon: History,
    subtitle: 'Tüm analiz kayıtları',
  },
  {
    href: '/reports',
    label: 'AI Raporları',
    icon: Sparkles,
    subtitle: 'Tamamlanmış AI analizleri',
  },
];

function getPageMeta(pathname) {
  if (pathname === '/dashboard') {
    return { title: 'Genel Bakış', subtitle: 'Panel özeti ve son aktiviteler' };
  }

  if (pathname === '/scrape') {
    return { title: 'Yeni Analiz', subtitle: 'Mağazadan yorum kazımayı başlatın' };
  }

  if (pathname === '/history') {
    return { title: 'Geçmiş Analizler', subtitle: 'Tüm kazıma ve analiz kayıtları' };
  }

  if (pathname === '/reports') {
    return { title: 'AI Raporları', subtitle: 'Gemini ile tamamlanmış analiz özetleri' };
  }

  if (pathname.startsWith('/analysis/')) {
    return { title: 'Analiz Detayı', subtitle: 'Yorumlar ve AI raporu' };
  }

  return { title: 'ScrappyAI', subtitle: 'Yorum analiz paneli' };
}

export default function DashboardLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const pageMeta = getPageMeta(pathname);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      console.error(error);
    } finally {
      router.replace('/login');
      router.refresh();
    }
  };

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className={styles.shell}>
      <div
        className={`${styles.overlay} ${sidebarOpen ? styles.overlayOpen : ''}`}
        onClick={closeSidebar}
        aria-hidden="true"
      />

      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.sidebarHeader}>
          <div className={styles.brand}>
            <div className={styles.brandIcon}>
              <Sparkles size={20} />
            </div>
            <div className={styles.brandText}>
              <h1>ScrappyAI</h1>
              <p>Analiz Paneli</p>
            </div>
          </div>
        </div>

        <nav className={styles.nav}>
          <span className={styles.navSection}>Menü</span>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === '/dashboard'
                ? pathname === '/dashboard'
                : pathname === item.href ||
                  pathname.startsWith(`${item.href}/`) ||
                  (item.href === '/reports' && pathname.startsWith('/analysis/'));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
                onClick={closeSidebar}
              >
                <Icon size={18} className={styles.navIcon} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className={styles.sidebarFooter}>
          <button
            type="button"
            className={`btn btn-secondary ${styles.logoutBtn}`}
            onClick={handleLogout}
          >
            <LogOut size={16} />
            Çıkış Yap
          </button>
        </div>
      </aside>

      <div className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <button
              type="button"
              className={styles.menuBtn}
              onClick={() => setSidebarOpen((open) => !open)}
              aria-label="Menüyü aç"
            >
              {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <div>
              <div className={styles.pageTitle}>{pageMeta.title}</div>
              <div className={styles.pageSubtitle}>{pageMeta.subtitle}</div>
            </div>
          </div>
          <ThemeToggle />
        </header>

        <main className={styles.content}>
          <AnalysisJobBanner />
          {children}
        </main>
      </div>
    </div>
  );
}
