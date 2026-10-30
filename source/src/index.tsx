// SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
// SPDX-License-Identifier: EUPL-1.2

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// The API key is typed into this page, so the page must not be reachable by any other page:
// - inside a frame, the surrounding page could overlay it or, from the same web address, read it;
// - opened with window.open(), the opening page keeps a handle to this tab and could read it.
// In both cases the generator does not start and offers to open itself in a tab of its own.
const framed = (() => { try { return window.self !== window.top; } catch { return true; } })();
const opened = (() => { try { return !!window.opener; } catch { return true; } })();

const root = ReactDOM.createRoot(rootElement);
if (framed || opened) {
  root.render(
    <main className="min-h-screen flex items-center justify-center p-8 bg-white text-ink">
      <div className="max-w-md">
        <h1 className="text-lg font-semibold">The DRMD AI Generator needs a tab of its own</h1>
        <p className="mt-2 text-sm text-ink-soft">
          {framed
            ? 'It was opened inside another web page. For the safety of your API key it only runs when it is opened directly.'
            : 'It was opened by another web page that could still reach it. For the safety of your API key it only runs when it is opened directly.'}
        </p>
        <a href={window.location.href} target="_blank" rel="noopener noreferrer" className="btn-primary mt-4 inline-flex">
          Open the DRMD AI Generator
        </a>
      </div>
    </main>
  );
} else {
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}
