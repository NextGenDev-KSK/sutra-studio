import { Component, type ErrorInfo, type ReactNode } from 'react';
import { STORAGE_KEY } from '../store/workspace';
import { downloadFile } from '../lib/download';

interface Props {
  children: ReactNode;
  /** Changing this value (e.g. the route) clears a previous error. */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

/**
 * Keeps one broken view from taking down the workspace. The planner can retry,
 * go back to the overview, or download the raw saved workspace before anything
 * else happens.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('View crashed', error, info.componentStack);
  }

  private downloadBackup = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) ?? '{}';
      downloadFile('sutra-studio-workspace-backup.json', raw, 'application/json');
    } catch {
      /* storage unavailable — nothing to export */
    }
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card card-pad" role="alert">
        <h2>Something went wrong in this view</h2>
        <p className="ink-2" style={{ marginTop: 6 }}>
          Your saved plans are untouched. Try again, return to the overview, or download a backup of the workspace.
        </p>
        <p className="small muted">{this.state.error.message}</p>
        <div className="row-wrap">
          <button className="btn btn-primary" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
          <a className="btn" href="#/">
            Go to overview
          </a>
          <button className="btn" onClick={this.downloadBackup}>
            Download workspace backup
          </button>
        </div>
      </div>
    );
  }
}
