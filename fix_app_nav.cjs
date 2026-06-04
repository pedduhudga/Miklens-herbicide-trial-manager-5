const fs = require('fs');

let code = fs.readFileSync('src/App.jsx', 'utf8');

const importReplacement = `import BottomNav from './components/BottomNav.jsx';`;

code = code.replace(/import Sidebar from '\.\/components\/Sidebar\.jsx';/, "import Sidebar from './components/Sidebar.jsx';\n" + importReplacement);

const layoutReplacement = `
function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);

  const { state } = useAppState();
  const { isAuthenticated } = useAuth();

  const isConfigured = !!state.settings?.scriptUrl && !!state.settings?.sheetId && !!state.settings?.folderId;

  if (!isConfigured) {
    return <Setup />;
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <div className="flex h-screen bg-slate-50 font-sans overflow-hidden">
      {/* Desktop Sidebar / Mobile Slide-over Menu */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content Area - adding pb-16 for mobile to avoid bottom nav overlap */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-transparent md:pb-0 pb-16">
`;

code = code.replace(/function AppLayout\(\) \{[\s\S]*?return \(\n    <div className="flex h-screen bg-slate-100 font-sans">\n      <Sidebar isOpen=\{sidebarOpen\} onClose=\{\(\) => setSidebarOpen\(false\)\} \/>\n      \n      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-transparent">/, layoutReplacement);


const endLayoutReplacement = `
      </main>

      <BottomNav onMoreClick={toggleSidebar} />
      <Toast />
      <LoadingOverlay />
    </div>
  );
}`;

code = code.replace(/<\/main>\n      \n      <Toast \/>\n      <LoadingOverlay \/>\n    <\/div>\n  \);\n\}/, endLayoutReplacement);

fs.writeFileSync('src/App.jsx', code);
