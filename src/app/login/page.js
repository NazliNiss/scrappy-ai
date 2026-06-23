import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import LoginForm from './LoginForm';
import styles from './page.module.css';

export const metadata = {
  title: 'Giriş — ScrappyAI',
  description: 'ScrappyAI panel girişi',
};

function LoginFallback() {
  return (
    <div className={styles.container}>
      <Loader2 className={styles.spinner} size={32} />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  );
}
