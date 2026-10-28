import { Component, type ReactNode } from 'react'
import { Icon } from '../design/icons'

/** Vangt crashes per scherm af zodat de rest van de app blijft werken. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="pt-safe mx-auto max-w-xl px-4">
        <div className="card mt-10 p-6 text-center">
          <Icon name="impact" size={40} className="mx-auto text-warn" />
          <div className="mt-3 font-semibold">Slam. Dit scherm crashte.</div>
          <p className="mt-1 text-sm text-muted">Je data is veilig. Probeer het opnieuw.</p>
          <pre className="mt-3 overflow-x-auto rounded-[6px] bg-surface-2 p-3 text-left text-xs text-muted">{this.state.error.message}</pre>
          <button onClick={() => location.reload()} className="mt-4 h-11 rounded-full bg-accent px-5 font-medium text-accent-ink">
            Herladen
          </button>
        </div>
      </div>
    )
  }
}
