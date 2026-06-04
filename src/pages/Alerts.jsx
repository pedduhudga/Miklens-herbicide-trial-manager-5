/**
 * Smart Alerts Page
 */

import TopBar from '../components/TopBar.jsx';
import SmartAlerts from '../components/SmartAlerts.jsx';
import { useNavigate } from 'react-router-dom';

export default function Alerts({ onMenuClick }) {
  const navigate = useNavigate();

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      <TopBar title="Smart Alerts" onMenuClick={onMenuClick} />
      <div className="flex-1 overflow-y-auto p-4 max-w-3xl mx-auto w-full">
        <SmartAlerts
          compact={false}
          onViewTrial={(trialId) => navigate('/trials')}
        />
      </div>
    </div>
  );
}
