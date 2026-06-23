import DashboardLayout from '@/components/layout/DashboardLayout';
import { AnalysisProgressProvider } from '@/context/AnalysisProgressProvider';

export default function PanelLayout({ children }) {
  return (
    <AnalysisProgressProvider>
      <DashboardLayout>{children}</DashboardLayout>
    </AnalysisProgressProvider>
  );
}
