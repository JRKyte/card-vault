import { Component, type ReactNode } from 'react'

/** Last-resort screen so a crash never leaves a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="grid min-h-dvh place-items-center p-6">
        <div className="glass max-w-md p-8 text-center">
          <h1 className="text-[26px] font-extrabold">Oops, something broke</h1>
          <p className="mt-2 text-[16px] text-ink-2">Your cards are safe. Reload to carry on.</p>
          <button type="button" className="btn-dark mt-5" onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      </div>
    )
  }
}
