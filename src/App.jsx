import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import PendingApproval from './pages/PendingApproval';
import StyleGuide from './pages/StyleGuide';
import './styles/global.css';
// Tema v2 (spec-kit TailAdmin). Inertes sem [data-v2] no <html> — ver index.html.
import './styles/theme-v2.css';
import './styles/components-v2.css';

function AppContent() {
  const { user, loading, approved } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <p>Carregando...</p>
      </div>
    );
  }

  if (!user) return <Login />;
  if (!approved) return <PendingApproval />;
  return <Dashboard />;
}

export default function App() {
  // Preview isolado do design system, sem auth: /#styleguide
  if (typeof window !== 'undefined' && window.location.hash.replace('#', '').startsWith('styleguide')) {
    return <StyleGuide />;
  }
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
