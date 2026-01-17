import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

console.log('🚀 Iniciando aplicação React...')
console.log('Root element:', document.getElementById('root'))

try {
  const rootElement = document.getElementById('root')
  if (!rootElement) {
    console.error('❌ Elemento root não encontrado!')
    document.body.innerHTML = '<div style="padding: 20px; font-family: sans-serif;"><h1>Erro: Elemento root não encontrado</h1></div>'
  } else {
    console.log('✅ Elemento root encontrado, renderizando App...')
    createRoot(rootElement).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
    console.log('✅ Aplicação renderizada com sucesso!')
  }
} catch (error) {
  console.error('❌ Erro ao renderizar aplicação:', error)
  const rootElement = document.getElementById('root') || document.body
  rootElement.innerHTML = `
    <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #0F172A; color: #FFF; font-family: sans-serif; padding: 20px; flex-direction: column; gap: 20px;">
      <h1 style="font-size: 2rem; color: #EF4444;">❌ Erro ao Carregar Aplicação</h1>
      <pre style="background: #1E293B; padding: 20px; border-radius: 10px; max-width: 800px; overflow: auto; white-space: pre-wrap;">
${error instanceof Error ? error.message : String(error)}
${error instanceof Error && error.stack ? '\n\n' + error.stack : ''}
      </pre>
      <button onclick="window.location.reload()" style="background: #FF5C00; color: white; padding: 12px 24px; border: none; border-radius: 10px; cursor: pointer; font-size: 16px;">
        Recarregar Página
      </button>
    </div>
  `
}
