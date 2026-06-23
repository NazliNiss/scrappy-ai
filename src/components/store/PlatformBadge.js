import { StoreLogo } from '@/components/store/StoreLogos';
import styles from './PlatformBadge.module.css';

export default function PlatformBadge({ platform, className = '' }) {
  const isIos = platform === 'ios';

  return (
    <span
      className={`${styles.badge} ${isIos ? styles.appStore : styles.googlePlay} ${className}`}
    >
      <StoreLogo platform={platform} size={14} className={styles.logo} />
      {isIos ? 'App Store' : 'Google Play'}
    </span>
  );
}
