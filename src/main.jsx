import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import Auth from './Auth.jsx';
import { supabase } from './supabaseClient.js';
import TechDeskDashboard from './TechDeskDashboard.jsx';

function Root() {
  const [orgId, setOrgId] = useState(null);
  // Switching companies drops you back at the gate — but the gate auto-selects
  // your company when you only belong to one, which would bounce you straight
  // back in. This tells it to show the picker regardless, so you can also join
  // or start another company from there.
  const [picking, setPicking] = useState(false);

  if (!orgId) {
    return (
      <Auth
        forcePicker={picking}
        onReady={(id) => {
          setOrgId(id);
          setPicking(false);
        }}
      />
    );
  }

  return (
    <TechDeskDashboard
      orgId={orgId}
      onSignOut={() => {
        setPicking(false);
        setOrgId(null);
        supabase.auth.signOut();
      }}
      onChangeCompany={() => {
        setPicking(true);
        setOrgId(null);
      }}
    />
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
