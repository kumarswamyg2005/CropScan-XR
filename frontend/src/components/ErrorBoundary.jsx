import { Component } from 'react'

/**
 * Stops one broken component blanking the whole document.
 *
 * Without a boundary, any error thrown during render unmounts the entire React
 * tree and the user gets a white page with no navbar and nothing in the
 * console they would think to look at. That is indistinguishable from "the site
 * is down", and it is what a WebGL failure, a malformed API response or a stale
 * hot-reload all look like.
 *
 * A boundary cannot catch errors in event handlers or async code -- only
 * render, lifecycle and constructors. That is exactly the class of failure that
 * blanks the page, which is why it is worth having.
 */
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Keep it in the console for whoever opens devtools next.
    console.error('[CropScan] render error', error, info?.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div style={{
        maxWidth: 620,
        margin: '0 auto',
        padding: 'var(--space-2xl) var(--space-lg)',
      }}>
        <div className="label-caps" style={{ marginBottom: 8 }}>Something broke</div>
        <h1 style={{
          fontFamily: '"Playfair Display", serif',
          fontSize: 32,
          margin: '0 0 12px',
        }}>
          {this.props.title ?? 'This part of the page failed to load'}
        </h1>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: 20 }}>
          The rest of the site still works. Reloading usually clears it — a stale
          hot-reload during development is the most common cause.
        </p>

        <pre style={{
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          padding: 12,
          fontSize: 12,
          overflowX: 'auto',
          color: 'var(--color-alert)',
          margin: '0 0 20px',
        }}>
          {String(error?.message ?? error)}
        </pre>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn-primary" onClick={() => window.location.reload()}>
            Reload the page
          </button>
          <button className="btn-secondary" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      </div>
    )
  }
}
