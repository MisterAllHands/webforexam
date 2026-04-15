import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://wswvamnfuvnrfekhbcjh.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_CYL_3C2tBYMvQe-17kWrBw_vnp1mfSh'
const TRUSTED_SESSION_KEY = 'galina-exam-trusted-session'
const DRAFT_TITLE = 'exam::galina::unit45::attempt'
const DRAFT_TYPE = 'call_script'
const DRAFT_MODEL = 'galina-exam-web-v2'
const STORAGE_BUCKET = 'documents'
const EMAIL_SALT = 'galina-unit45-private-review'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})

export function isReviewModeRequest() {
  return new URLSearchParams(window.location.search).get('review') === '1'
}

function hashAccessCode(value) {
  let first = 0xdeadbeef ^ value.length
  let second = 0x41c6ce57 ^ value.length

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    first = Math.imul(first ^ code, 2654435761)
    second = Math.imul(second ^ code, 1597334677)
  }

  first = Math.imul(first ^ (first >>> 16), 2246822507) ^ Math.imul(second ^ (second >>> 13), 3266489909)
  second = Math.imul(second ^ (second >>> 16), 2246822507) ^ Math.imul(first ^ (first >>> 13), 3266489909)

  return [first >>> 0, second >>> 0].map((item) => item.toString(36)).join('')
}

function getExamEmail(accessCode) {
  return `exam-${hashAccessCode(`${EMAIL_SALT}:${accessCode}`)}@private-exam.test`
}

function normalizeAuthMessage(message) {
  const value = message.toLowerCase()

  if (value.includes('invalid login credentials')) {
    return 'That access code does not match this private exam.'
  }

  if (value.includes('email not confirmed')) {
    return 'This Supabase project is requiring email confirmation. I need one admin pass to finish backend setup.'
  }

  if (value.includes('password')) {
    return 'That access code could not open the private exam.'
  }

  return message
}

export function rememberTrustedSession(email) {
  window.localStorage.setItem(TRUSTED_SESSION_KEY, email)
}

export function clearTrustedSession() {
  window.localStorage.removeItem(TRUSTED_SESSION_KEY)
}

export function isTrustedSession(session) {
  const trustedEmail = window.localStorage.getItem(TRUSTED_SESSION_KEY)
  return Boolean(session?.user?.email && trustedEmail && trustedEmail === session.user.email)
}

async function ensureExamProfile(user) {
  const { error } = await supabase.from('users').upsert(
    {
      id: user.id,
      email: user.email ?? '',
      first_name: 'Galina',
    },
    { onConflict: 'id' },
  )

  if (error) {
    throw new Error(error.message)
  }
}

export async function getCurrentSession() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession()

  if (error) {
    throw new Error(error.message)
  }

  return session
}

export async function openExamSession(accessCode) {
  const email = getExamEmail(accessCode)

  const signInAttempt = await supabase.auth.signInWithPassword({
    email,
    password: accessCode,
  })

  if (!signInAttempt.error && signInAttempt.data.session && signInAttempt.data.user) {
    await ensureExamProfile(signInAttempt.data.user)
    rememberTrustedSession(email)
    return signInAttempt.data.session
  }

  const signUpAttempt = await supabase.auth.signUp({
    email,
    password: accessCode,
    options: {
      data: {
        scope: 'galina-private-exam',
      },
    },
  })

  if (signUpAttempt.error) {
    throw new Error(normalizeAuthMessage(signInAttempt.error?.message || signUpAttempt.error.message))
  }

  if (signUpAttempt.data.session && signUpAttempt.data.user) {
    await ensureExamProfile(signUpAttempt.data.user)
    rememberTrustedSession(email)
    return signUpAttempt.data.session
  }

  const retrySignIn = await supabase.auth.signInWithPassword({
    email,
    password: accessCode,
  })

  if (retrySignIn.error || !retrySignIn.data.session || !retrySignIn.data.user) {
    throw new Error(
      normalizeAuthMessage(
        retrySignIn.error?.message ||
          'The private exam space could not be opened. The backend may still require email confirmation.',
      ),
    )
  }

  await ensureExamProfile(retrySignIn.data.user)
  rememberTrustedSession(email)
  return retrySignIn.data.session
}

export async function signOutExamSession() {
  clearTrustedSession()
  const { error } = await supabase.auth.signOut()

  if (error) {
    throw new Error(error.message)
  }
}

export async function fetchLatestAttempt() {
  const { data, error } = await supabase
    .from('drafts')
    .select('id, content, created_at, updated_at')
    .eq('draft_type', DRAFT_TYPE)
    .eq('title', DRAFT_TITLE)
    .eq('model_name', DRAFT_MODEL)
    .order('updated_at', { ascending: false })
    .limit(1)

  if (error) {
    throw new Error(error.message)
  }

  if (!data || data.length === 0) {
    return null
  }

  const [row] = data

  try {
    const parsed = JSON.parse(row.content)
    return {
      id: row.id,
      payload: parsed,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  } catch {
    return null
  }
}

export async function saveAttemptRemote(attemptId, payload) {
  const body = {
    title: DRAFT_TITLE,
    draft_type: DRAFT_TYPE,
    model_name: DRAFT_MODEL,
    content: JSON.stringify(payload),
  }

  if (attemptId) {
    const { data, error } = await supabase
      .from('drafts')
      .update(body)
      .eq('id', attemptId)
      .select('id, updated_at')
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return data
  }

  const { data, error } = await supabase
    .from('drafts')
    .insert(body)
    .select('id, updated_at')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

export async function getRecordingPlaybackUrl(path) {
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(path, 60 * 60)

  if (error) {
    throw new Error(error.message)
  }

  return data.signedUrl
}

export async function uploadSpeakingRecording({ attemptId, partId, blob }) {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user?.id) {
    throw new Error('The private exam session has expired. Re-enter the access code and try again.')
  }

  const extension = blob.type.includes('mp4')
    ? 'm4a'
    : blob.type.includes('ogg')
      ? 'ogg'
      : blob.type.includes('mpeg')
        ? 'mp3'
        : 'webm'
  const objectPath = `${session.user.id}/exam/${attemptId || 'pending'}/${partId}-${Date.now()}.${extension}`

  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(objectPath, blob, {
    contentType: blob.type || 'audio/webm',
    upsert: true,
  })

  if (error) {
    throw new Error(error.message)
  }

  const playbackUrl = await getRecordingPlaybackUrl(objectPath)

  return {
    storagePath: objectPath,
    playbackUrl,
  }
}

export async function deleteSpeakingRecording(path) {
  if (!path) {
    return
  }

  const { error } = await supabase.storage.from(STORAGE_BUCKET).remove([path])

  if (error) {
    throw new Error(error.message)
  }
}
