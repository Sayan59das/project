import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ColorModeProvider } from './theme/ColorModeContext';
import { AuthProvider } from './auth/AuthContext';
import './index.css';

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ColorModeProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ColorModeProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>
);
