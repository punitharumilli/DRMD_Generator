// SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
// SPDX-License-Identifier: EUPL-1.2

import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
          <div className="w-full max-w-lg rounded-md border border-line bg-white p-6 border-l-[3px] border-l-bad">
            <h1 className="text-lg font-semibold text-ink">The generator stopped because of an unexpected error</h1>
            <p className="mt-2 text-sm text-ink-soft">
              This usually comes from data the form did not expect. Reloading starts a fresh session; work that was not exported is lost.
            </p>
            {this.state.error && (
              <pre className="mt-4 rounded border border-line bg-sunken p-3 text-xs font-mono text-ink-soft whitespace-pre-wrap break-words max-h-48 overflow-auto">
                {this.state.error.toString()}
              </pre>
            )}
            <button className="btn-primary mt-5" onClick={() => window.location.reload()}>
              Reload the generator
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
