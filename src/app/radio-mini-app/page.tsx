import { redirect } from 'next/navigation'

// Redirect to main page - /radio-mini-app is deprecated
export default function RadioPage() {
  redirect('/')
}
