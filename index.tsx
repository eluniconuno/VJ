import React from 'react';
import ReactDOM from 'react-dom/client';
import { StudioApp } from './studio/StudioApp';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Sem StrictMode: o motor WebGL é criado uma única vez por montagem.
ReactDOM.createRoot(rootElement).render(<StudioApp />);
