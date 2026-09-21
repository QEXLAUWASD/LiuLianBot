import { Component } from 'react';

// A page-level error boundary: one broken screen should never blank the whole
// document, and users get a way back without a hard refresh.
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.retry = this.retry.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('LiuLianBot page render failed:', error, info);
  }

  retry() {
    this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="error-page error-boundary" id="main-content" role="alert">
        <h1>Something went wrong</h1>
        <p>This page could not be displayed. You can retry or return to the dashboard.</p>
        <div className="error-actions">
          <button className="btn btn-primary" type="button" onClick={this.retry}>
            Try again
          </button>
          <a className="btn btn-outline" href="/">Go Home</a>
        </div>
      </main>
    );
  }
}
