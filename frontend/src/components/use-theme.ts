import { useState } from 'react'

export function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  const toggleDark = () => {
    const next = !document.documentElement.classList.contains('dark')
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('qa-dark', next ? 'yes' : 'no')
    setDark(next)
  }
  return { dark, toggleDark }
}
