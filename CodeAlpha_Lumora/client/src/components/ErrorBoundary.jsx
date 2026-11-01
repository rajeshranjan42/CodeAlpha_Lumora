import { Component } from 'react';

/** Catches a crash in part of the app so the whole page never goes blank. Shows the error so it can be fixed. */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Lumora crashed:', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.inline)
      return (
        <div className="toast" role="alert" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
          <strong>Something went wrong</strong>
          <small style={{ wordBreak: 'break-word' }}>{String(error.message || error)}</small>
          <button className="btn btn-primary btn-sm" onClick={() => { this.setState({ error: null }); this.props.onReset?.(); }}>
            Close
          </button>
        </div>
      );
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: 'var(--bg, #14101f)', color: 'var(--ink, #fff)' }}>
        <div style={{ maxWidth: 460, textAlign: 'center' }}>
          <h2>Something went wrong</h2>
          <p style={{ opacity: 0.75, wordBreak: 'break-word' }}>{String(error.message || error)}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Reload Lumora
          </button>
        </div>
      </div>
    );
  }
}