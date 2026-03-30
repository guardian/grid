/**
 * React Error Boundary — catches render errors in child components and
 * shows a recovery UI instead of a white screen.
 *
 * React requires error boundaries to be class components — there is no
 * hook equivalent for componentDidCatch / getDerivedStateFromError.
 *
 * Placement: wraps <Outlet /> in __root.tsx so any route crash is caught.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Optional custom fallback — defaults to a built-in recovery UI */
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log to console for now — in Phase 3 this could report to Sentry/etc.
    console.error("[ErrorBoundary] Caught render error:", error, info);
  }

  private handleReset = () => {
    this.setState({ error: null });
  };

  private handleReload = () => {
    window.location.href = "/search?nonFree=true";
  };

  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="h-screen w-screen flex items-center justify-center bg-grid-bg text-grid-text p-8">
          <div className="max-w-lg text-center space-y-4">
            <h1 className="text-lg font-semibold">Something went wrong</h1>
            <p className="text-sm text-grid-text-muted">
              {this.state.error.message}
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="px-3 py-1.5 text-sm rounded bg-grid-accent text-white hover:opacity-90 transition-opacity"
              >
                Try again
              </button>
              <button
                onClick={this.handleReload}
                className="px-3 py-1.5 text-sm rounded border border-grid-border text-grid-text hover:bg-grid-hover transition-colors"
              >
                Reset app
              </button>
            </div>
            <details className="text-left mt-4">
              <summary className="text-sm text-grid-text-muted cursor-pointer hover:text-grid-text">
                Error details
              </summary>
              <pre className="mt-2 text-sm text-grid-text-muted bg-grid-bg rounded p-3 overflow-auto max-h-48 whitespace-pre-wrap break-words">
                {this.state.error.stack}
              </pre>
            </details>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

