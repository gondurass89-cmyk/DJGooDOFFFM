import RadioMiniApp from './radio-mini-app/RadioMiniApp'
import { ErrorBoundary } from './radio-mini-app/components'

export default function Home() {
  return (
    <ErrorBoundary>
      <RadioMiniApp />
    </ErrorBoundary>
  )
}
