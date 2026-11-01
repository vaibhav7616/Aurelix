import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { captureSubAffiliateInvite, captureLinkClick } from './lib/attribution';
import { post } from './lib/api';

// before routing: /affiliate may redirect to /login and drop the ?sub= invite code
captureSubAffiliateInvite();
// partner links (?lid=123) work on any public page
void captureLinkClick((body) => post('/api/v1/public/aff-click', body));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
