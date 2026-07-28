import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import Auth from './Auth.jsx';
import { supabase } from './supabaseClient.js';
import TechDeskDashboard from './TechDeskDashboard.jsx';

function Root() {
  const [orgId, setOrgId] = useState(null);

  if (!orgId) {
    return <Auth onReady={setOrgId} />;
  }

  return <TechDeskDashboard orgId={orgId} onSignOut={() => { setOrgId(null); supabase.auth.signOut(); }} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
