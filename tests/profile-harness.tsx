import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AccountDetailsSection } from '../src/components/settings/AccountDetailsSection';
import { FixtureAuthProvider } from './profile-fixture';
import '../src/index.css';
const client=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
createRoot(document.getElementById('root')!).render(<FixtureAuthProvider><QueryClientProvider client={client}><main style={{maxWidth:720,margin:'40px auto',padding:24}}><AccountDetailsSection/></main></QueryClientProvider></FixtureAuthProvider>);
