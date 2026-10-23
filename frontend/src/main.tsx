import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import App from './app'
import { PageErrorBoundary } from './components/ui'
import './styles.css'
import './workspace.css'

if (localStorage.getItem('qa-dark') === 'yes') document.documentElement.classList.add('dark')
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false } } })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter><PageErrorBoundary><App /></PageErrorBoundary></BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
