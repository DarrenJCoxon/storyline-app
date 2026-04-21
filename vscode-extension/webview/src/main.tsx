import React from 'react';
import { createRoot } from 'react-dom/client';
import { Editor } from './Editor';
import './styles.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Storyline webview: #root container not found');
}

createRoot(container).render(
  <React.StrictMode>
    <Editor />
  </React.StrictMode>,
);
