import { createRequire } from 'node:module'

// Electron waits for this entry to finish before freezing profile paths and the Keychain name.
const { mainProcessStartup } = createRequire(import.meta.url)('./index.js')
await mainProcessStartup
