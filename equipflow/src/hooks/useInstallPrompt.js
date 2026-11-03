import { useEffect, useState } from 'react'

// Browsers fire "beforeinstallprompt" when the site can be installed as an app.
// We keep that event, so the Profile page can offer an "Install app" button.
export function useInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const onPrompt = (event) => {
      event.preventDefault() // stop the browser's own mini-banner; we show our button
      setPromptEvent(event)
    }
    const onInstalled = () => setInstalled(true)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  async function install() {
    if (!promptEvent) return
    promptEvent.prompt()
    await promptEvent.userChoice
    setPromptEvent(null)
  }

  return { canInstall: Boolean(promptEvent) && !installed, install }
}
