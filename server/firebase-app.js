import { readFile } from 'node:fs/promises'

const textValue = (value) => typeof value === 'string' && value.length < 512 && !/[\r\n]/.test(value) ? value.trim() : ''

export function firebaseProjectId(env = {}) {
  return textValue(env.FIREBASE_PROJECT_ID) || textValue(env.GOOGLE_CLOUD_PROJECT) || ''
}

let appPromise
let appKey

/**
 * One lazily-initialised Firebase Admin app shared by token verification,
 * the identity store and the usage store, so all three run under the same
 * project and credentials. Never allow the Admin SDK's unsigned
 * emulator-token shortcut anywhere in this service.
 */
export async function loadFirebaseApp(env = process.env) {
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST || env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Auth emulator is not supported here')
  const projectId = firebaseProjectId(env)
  if (!projectId) throw new Error('Firebase project is not configured')
  const name = `storyweave-auth-${projectId}`
  if (appPromise && appKey === name) return appPromise
  appKey = name
  appPromise = (async () => {
    const { initializeApp, getApps, applicationDefault, cert } = await import('firebase-admin/app')
    let app = getApps().find((entry) => entry.name === name)
    if (!app) {
      const credential = env.FIREBASE_ADMIN_CREDENTIALS_FILE
        ? cert(JSON.parse(await readFile(env.FIREBASE_ADMIN_CREDENTIALS_FILE, 'utf8')))
        : applicationDefault()
      app = initializeApp({ projectId, credential }, name)
    }
    return app
  })().catch((error) => { if (appKey === name) appPromise = undefined; throw error })
  return appPromise
}

export async function loadFirestore(env = process.env) {
  const app = await loadFirebaseApp(env)
  const { getFirestore } = await import('firebase-admin/firestore')
  return getFirestore(app)
}
