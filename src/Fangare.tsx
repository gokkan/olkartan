import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Kartan ska överleva att något runt omkring går sönder.
 *
 * En null i produktdatan tog en gång ner hela sidan — sökrutan kraschade och
 * med den försvann även kartan, som inte hade med saken att göra. Panelen och
 * sökningen ligger därför var för sig innanför en fångare.
 */
export default class Fangare extends Component<
  { children: ReactNode; namn: string },
  { trasig: boolean }
> {
  state = { trasig: false }

  static getDerivedStateFromError() {
    return { trasig: true }
  }

  componentDidCatch(fel: Error, info: ErrorInfo) {
    console.error(`${this.props.namn} kraschade:`, fel, info.componentStack)
  }

  render() {
    if (this.state.trasig) {
      return <p className="krasch">{this.props.namn} slutade fungera. Ladda om sidan.</p>
    }
    return this.props.children
  }
}
