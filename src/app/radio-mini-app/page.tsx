import RadioMiniApp from './RadioMiniApp'
import { ErrorBoundary } from './components'

export default function RadioPage() {
  return (
    <ErrorBoundary>
      <RadioMiniApp />
    </ErrorBoundary>
  )
}
