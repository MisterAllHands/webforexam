import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://ajvrosiqfcxkppzsncej.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_8Tv1dlkOMMQHc8scFqd91A_vhlnnQJa'
const TRUSTED_SESSION_KEY = 'galina-exam-trusted-session'
const ATTEMPTS_TABLE = 'exam_attempts'
const EXAM_SLUG = 'galina-unit45'
const STORAGE_BUCKET = 'exam-recordings'
const STUDENT_EMAIL = 'galina-unit45-exam@private-exam.test'
const REVIEWER_EMAIL = 'ramazan-review@private-exam.test'

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

function normalizeAuthMessage(message) {
  const value = message.toLowerCase()

  if (value.includes('fetch failed')) {
    return 'The private exam backend is not reachable right now.'
  }

  if (value.includes('invalid login credentials')) {
    return 'That access code does not match this private exam.'
  }

  if (value.includes('email not confirmed')) {
    return 'This Supabase project is still blocking sign-in because email confirmation is enabled.'
  }

  if (value.includes('password')) {
    return 'That access code could not open the private exam.'
  }

  return message
}

function getSessionEmail({ reviewMode = false } = {}) {
  return reviewMode ? REVIEWER_EMAIL : STUDENT_EMAIL
}

function getExamStatus(payload) {
  if (payload?.lockedAt) {
    return 'locked'
  }

  if (payload?.startedAt) {
    return 'in_progress'
  }

  return 'draft'
}

function sanitizeAttemptPayload(payload) {
  if (!payload?.speaking) {
    return payload
  }

  const nextSpeaking = {}

  for (const [partId, partState] of Object.entries(payload.speaking)) {
    nextSpeaking[partId] = {
      recording: partState?.recording
        ? {
            ...partState.recording,
            dataUrl: null,
            playbackUrl: null,
          }
        : null,
    }
  }

  return {
    ...payload,
    speaking: nextSpeaking,
  }
}

async function hydrateRecordingPlaybackUrls(payload) {
  if (!payload?.speaking) {
    return payload
  }

  const nextSpeaking = {}

  for (const [partId, partState] of Object.entries(payload.speaking)) {
    const recording = partState?.recording

    if (!recording) {
      nextSpeaking[partId] = { recording: null }
      continue
    }

    let playbackUrl = recording.playbackUrl || null

    if (recording.storagePath) {
      try {
        playbackUrl = await getRecordingPlaybackUrl(recording.storagePath)
      } catch {
        playbackUrl = null
      }
    }

    nextSpeaking[partId] = {
      recording: {
        ...recording,
        dataUrl: null,
        playbackUrl,
      },
    }
  }

  return {
    ...payload,
    speaking: nextSpeaking,
  }
}

async function getActiveSessionOrThrow() {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user?.id) {
    throw new Error('The private exam session has expired. Re-enter the access code and try again.')
  }

  return session
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

export async function openExamSession(accessCode, { reviewMode = false } = {}) {
  const email = getSessionEmail({ reviewMode })
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: accessCode,
  })

  if (error || !data.session || !data.user) {
    throw new Error(normalizeAuthMessage(error?.message || 'The private exam space could not be opened.'))
  }

  rememberTrustedSession(email)
  return data.session
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
    .from(ATTEMPTS_TABLE)
    .select('id, owner_id, payload, created_at, updated_at')
    .eq('exam_slug', EXAM_SLUG)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (!data) {
    return null
  }

  return {
    id: data.id,
    ownerId: data.owner_id,
    payload: await hydrateRecordingPlaybackUrls(data.payload || {}),
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  }
}

export async function saveAttemptRemote(attemptId, payload) {
  const session = await getActiveSessionOrThrow()
  const sanitizedPayload = sanitizeAttemptPayload(payload)

  const body = {
    student_name: 'Galina',
    status: getExamStatus(sanitizedPayload),
    payload: sanitizedPayload,
  }

  if (attemptId) {
    const { data, error } = await supabase
      .from(ATTEMPTS_TABLE)
      .update(body)
      .eq('id', attemptId)
      .select('id, updated_at')
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return data
  }

  if (session.user.email === REVIEWER_EMAIL) {
    throw new Error('The reviewer panel is waiting for Galina to create the first exam attempt.')
  }

  const { data, error } = await supabase
    .from(ATTEMPTS_TABLE)
    .upsert(
      {
        exam_slug: EXAM_SLUG,
        owner_id: session.user.id,
        ...body,
      },
      { onConflict: 'exam_slug,owner_id' },
    )
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
  const session = await getActiveSessionOrThrow()

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

  return {
    storagePath: objectPath,
    playbackUrl: await getRecordingPlaybackUrl(objectPath),
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
