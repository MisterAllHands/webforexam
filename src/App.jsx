import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  Award,
  BookOpen,
  CheckCircle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  Clock,
  Headphones,
  Lightbulb,
  Mic,
  PenLine,
  Play,
  Printer,
  Send,
  ShieldCheck,
  Square,
  Star,
  Target,
  Trash2,
  X,
} from 'lucide-react'
import './App.css'
import { examData } from './examData'
import {
  deleteSpeakingRecording,
  fetchLatestAttempt,
  getCurrentSession,
  isReviewModeRequest,
  isTrustedSession,
  openExamSession,
  saveAttemptRemote,
  signOutExamSession,
  uploadSpeakingRecording,
} from './lib/examBackend'

const STORAGE_KEY = 'galina-exam-template-v1'
const EXAM_DURATION_SECONDS = 3 * 60 * 60
const REMOTE_SAVE_DEBOUNCE_MS = 900
const SECTION_ORDER = ['reading', 'listening', 'writing', 'speaking']
const SECTION_THEMES = {
  reading: {
    icon: BookOpen,
    accent: '#7a2535',
    soft: 'rgba(122, 37, 53, 0.08)',
    border: 'rgba(122, 37, 53, 0.18)',
    glow: 'rgba(122, 37, 53, 0.24)',
  },
  listening: {
    icon: Headphones,
    accent: '#2d5a7a',
    soft: 'rgba(45, 90, 122, 0.08)',
    border: 'rgba(45, 90, 122, 0.18)',
    glow: 'rgba(45, 90, 122, 0.24)',
  },
  writing: {
    icon: PenLine,
    accent: '#2d6b4a',
    soft: 'rgba(45, 107, 74, 0.08)',
    border: 'rgba(45, 107, 74, 0.18)',
    glow: 'rgba(45, 107, 74, 0.24)',
  },
  speaking: {
    icon: Mic,
    accent: '#6b2d7a',
    soft: 'rgba(107, 45, 122, 0.08)',
    border: 'rgba(107, 45, 122, 0.18)',
    glow: 'rgba(107, 45, 122, 0.24)',
  },
}

function createInitialPlayCounts() {
  return Object.fromEntries(examData.listening.sections.map((section) => [section.id, 0]))
}

function createInitialAudioState() {
  return Object.fromEntries(
    examData.listening.sections.map((section) => [
      section.id,
      {
        currentTime: 0,
        duration: 0,
        isPlaying: false,
        hasFinished: false,
      },
    ]),
  )
}

function createInitialState() {
  const answers = {}
  const writing = {}
  const speaking = {}
  const writingScores = {}
  const speakingScores = {}

  for (const passage of examData.reading.passages) {
    for (const question of passage.questions) {
      answers[question.id] = ''
    }
  }

  for (const audioSection of examData.listening.sections) {
    for (const question of audioSection.questions) {
      answers[question.id] = ''
    }
  }

  for (const task of examData.writing.tasks) {
    writing[task.id] = ''
  }

  for (const part of examData.speaking.parts) {
    speaking[part.id] = {
      recording: null,
    }
  }

  for (const criterion of examData.writing.rubric) {
    writingScores[criterion.id] = 0
  }

  for (const criterion of examData.speaking.rubric) {
    speakingScores[criterion.id] = 0
  }

  return {
    startedAt: '',
    lockedAt: '',
    lockedReason: '',
    lastUpdatedAt: '',
    currentSection: 'overview',
    playCounts: createInitialPlayCounts(),
    answers,
    writing,
    speaking,
    teacherReview: {
      writingScores,
      speakingScores,
      writingComment: '',
      speakingComment: '',
      overallComment: '',
      reviewedAt: '',
    },
  }
}

function normalizeText(value) {
  return value
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s:.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isFilled(value) {
  return typeof value === 'string' ? value.trim().length > 0 : Boolean(value)
}

function countWords(value) {
  return value.trim() ? value.trim().split(/\s+/).length : 0
}

function getAllObjectiveQuestions() {
  const readingQuestions = examData.reading.passages.flatMap((passage) => passage.questions)
  const listeningQuestions = examData.listening.sections.flatMap((section) => section.questions)
  return {
    reading: readingQuestions,
    listening: listeningQuestions,
  }
}

function scoreQuestion(question, candidateAnswer) {
  const answer = normalizeText(candidateAnswer || '')

  if (!answer) {
    return 0
  }

  if (question.type === 'multipleChoice' || question.type === 'trueFalseNotGiven') {
    return answer === normalizeText(question.answer) ? question.points : 0
  }

  const acceptedAnswers = Array.isArray(question.answer) ? question.answer : [question.answer]
  const isCorrect = acceptedAnswers.some((item) => answer === normalizeText(item))

  return isCorrect ? question.points : 0
}

function getObjectiveSectionScore(questions, answers) {
  let earned = 0
  let possible = 0
  let answered = 0

  for (const question of questions) {
    possible += question.points
    if (isFilled(answers[question.id])) {
      answered += 1
    }
    earned += scoreQuestion(question, answers[question.id])
  }

  return {
    earned,
    possible,
    answered,
    totalQuestions: questions.length,
  }
}

function getFocusAreaBreakdown(questions, answers) {
  const breakdown = new Map()

  for (const question of questions) {
    for (const tag of question.tags || []) {
      const current = breakdown.get(tag) || {
        tag,
        earned: 0,
        possible: 0,
        answered: 0,
        totalQuestions: 0,
      }

      current.possible += question.points
      current.totalQuestions += 1

      if (isFilled(answers[question.id])) {
        current.answered += 1
      }

      current.earned += scoreQuestion(question, answers[question.id])
      breakdown.set(tag, current)
    }
  }

  return [...breakdown.values()]
    .map((item) => ({
      ...item,
      percent: item.possible === 0 ? 0 : Math.round((item.earned / item.possible) * 100),
    }))
    .sort((left, right) => left.percent - right.percent)
}

function getTeacherScore(scoreMap) {
  return Object.values(scoreMap).reduce((sum, value) => sum + Number(value || 0), 0)
}

function isManualSectionReviewed(scoreMap, comment) {
  return Object.values(scoreMap).some((value) => Number(value) > 0) || isFilled(comment)
}

function getStorageSafeState(state) {
  const safeSpeaking = {}

  for (const [partId, partState] of Object.entries(state.speaking)) {
    safeSpeaking[partId] = {
      recording: partState.recording
        ? {
            name: partState.recording.name,
            mimeType: partState.recording.mimeType,
            durationLabel: partState.recording.durationLabel,
            dataUrl: partState.recording.dataUrl || null,
            playbackUrl: partState.recording.playbackUrl || null,
            storagePath: partState.recording.storagePath || null,
          }
        : null,
    }
  }

  return {
    ...state,
    speaking: safeSpeaking,
  }
}

function mergeImportedState(rawState) {
  const base = createInitialState()
  return {
    ...base,
    ...rawState,
    answers: {
      ...base.answers,
      ...(rawState.answers || {}),
    },
    writing: {
      ...base.writing,
      ...(rawState.writing || {}),
    },
    playCounts: {
      ...base.playCounts,
      ...(rawState.playCounts || {}),
    },
    speaking: {
      ...base.speaking,
      ...(rawState.speaking || {}),
    },
    teacherReview: {
      ...base.teacherReview,
      ...(rawState.teacherReview || {}),
      writingScores: {
        ...base.teacherReview.writingScores,
        ...((rawState.teacherReview && rawState.teacherReview.writingScores) || {}),
      },
      speakingScores: {
        ...base.teacherReview.speakingScores,
        ...((rawState.teacherReview && rawState.teacherReview.speakingScores) || {}),
      },
    },
  }
}

function loadSavedState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return createInitialState()
    }

    return mergeImportedState(JSON.parse(raw))
  } catch {
    return createInitialState()
  }
}

function getCompletionStatus(state) {
  const { reading, listening } = getAllObjectiveQuestions()

  const readingComplete = reading.every((question) => isFilled(state.answers[question.id]))
  const listeningComplete = listening.every((question) => isFilled(state.answers[question.id]))
  const writingComplete = examData.writing.tasks.every((task) => isFilled(state.writing[task.id]))
  const speakingComplete = examData.speaking.parts.every(
    (part) => state.speaking[part.id] && state.speaking[part.id].recording,
  )

  return {
    reading: readingComplete,
    listening: listeningComplete,
    writing: writingComplete,
    speaking: speakingComplete,
  }
}

function getReadinessLabel(score, percent) {
  if (score === 0) {
    return 'Ready to begin'
  }
  if (percent >= 85) {
    return 'Strong readiness'
  }
  if (percent >= examData.meta.passPercentage) {
    return 'On track'
  }
  if (percent >= 55) {
    return 'Needs targeted revision'
  }
  return 'Needs a full review cycle'
}

function formatTimestamp(value) {
  if (!value) {
    return 'Not recorded yet'
  }

  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0:00'
  }

  const wholeSeconds = Math.ceil(seconds)
  const minutes = Math.floor(wholeSeconds / 60)
  const remainder = wholeSeconds % 60

  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

function formatCountdown(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '00:00:00'
  }

  const wholeSeconds = Math.floor(seconds)
  const hours = Math.floor(wholeSeconds / 3600)
  const minutes = Math.floor((wholeSeconds % 3600) / 60)
  const remainder = wholeSeconds % 60

  return [hours, minutes, remainder].map((item) => String(item).padStart(2, '0')).join(':')
}

function getRecordingSource(recording) {
  if (!recording) {
    return ''
  }

  return recording.playbackUrl || recording.dataUrl || ''
}

function getRecordingFileExtension(mimeType) {
  if (mimeType.includes('mp4')) {
    return 'm4a'
  }

  if (mimeType.includes('ogg')) {
    return 'ogg'
  }

  if (mimeType.includes('mpeg')) {
    return 'mp3'
  }

  return 'webm'
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function getComparableState(state) {
  return JSON.stringify({
    ...getStorageSafeState(state),
    lastUpdatedAt: '',
  })
}

function App() {
  const initialStateRef = useRef(null)
  if (!initialStateRef.current) {
    initialStateRef.current = loadSavedState()
  }

  const [examState, setExamState] = useState(() => initialStateRef.current)
  const [currentSection, setCurrentSection] = useState(() => initialStateRef.current.currentSection || 'overview')
  const [reviewRequested] = useState(() =>
    typeof window !== 'undefined' ? isReviewModeRequest() : false,
  )
  const [introView, setIntroView] = useState('landing')
  const [overviewChecks, setOverviewChecks] = useState({})
  const [now, setNow] = useState(() => Date.now())
  const [audioState, setAudioState] = useState(() => createInitialAudioState())
  const [activeListeningId, setActiveListeningId] = useState('')
  const [listeningError, setListeningError] = useState('')
  const [recordingError, setRecordingError] = useState('')
  const [activeRecordingId, setActiveRecordingId] = useState('')
  const [recordingElapsedSeconds, setRecordingElapsedSeconds] = useState(0)
  const [showSubmitPrompt, setShowSubmitPrompt] = useState(false)
  const [authStatus, setAuthStatus] = useState('checking')
  const [accessCode, setAccessCode] = useState('')
  const [authError, setAuthError] = useState('')
  const [syncStatus, setSyncStatus] = useState('idle')
  const [syncError, setSyncError] = useState('')
  const [syncTimestamp, setSyncTimestamp] = useState('')
  const [remoteAttemptId, setRemoteAttemptId] = useState('')
  const [hasHydratedRemote, setHasHydratedRemote] = useState(false)
  const [teacherToolsOpen, setTeacherToolsOpen] = useState(() =>
    typeof window !== 'undefined' && isReviewModeRequest(),
  )

  const audioRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const mediaChunksRef = useRef([])
  const mediaStreamRef = useRef(null)
  const recordingStartedAtRef = useRef(0)
  const remoteSyncTimeoutRef = useRef(null)
  const lastRemoteComparableRef = useRef('')
  const hasStarted = isFilled(examState.startedAt)
  const startedAtMs = hasStarted ? Date.parse(examState.startedAt) : 0
  const deadlineMs = startedAtMs + EXAM_DURATION_SECONDS * 1000
  const remainingSeconds = hasStarted ? Math.max(0, Math.ceil((deadlineMs - now) / 1000)) : EXAM_DURATION_SECONDS
  const timerExpired = hasStarted && remainingSeconds <= 0
  const isExamLocked = isFilled(examState.lockedAt) || timerExpired
  const hasActiveAttempt = hasStarted && !isExamLocked
  const hasLockedAttempt = hasStarted && isExamLocked
  const allChecklistReady = examData.overview.preflightChecklist.every((_, index) => overviewChecks[index])
  const totalSectionPoints = examData.overview.sections.reduce((sum, section) => sum + section.points, 0)

  const { reading: readingQuestions, listening: listeningQuestions } = getAllObjectiveQuestions()
  const objectiveQuestions = [...readingQuestions, ...listeningQuestions]
  const readingScore = getObjectiveSectionScore(readingQuestions, examState.answers)
  const listeningScore = getObjectiveSectionScore(listeningQuestions, examState.answers)
  const objectiveTotalScore = readingScore.earned + listeningScore.earned
  const objectiveMaxScore = readingScore.possible + listeningScore.possible
  const objectivePercent = objectiveMaxScore === 0 ? 0 : Math.round((objectiveTotalScore / objectiveMaxScore) * 100)
  const focusAreaBreakdown = getFocusAreaBreakdown(objectiveQuestions, examState.answers)
  const revisionPriorities = focusAreaBreakdown.filter((item) => item.percent < examData.meta.passPercentage).slice(0, 4)
  const strongestAreas = [...focusAreaBreakdown].reverse().slice(0, 3)
  const writingTeacherScore = getTeacherScore(examState.teacherReview.writingScores)
  const speakingTeacherScore = getTeacherScore(examState.teacherReview.speakingScores)
  const writingReviewed = isManualSectionReviewed(
    examState.teacherReview.writingScores,
    examState.teacherReview.writingComment,
  )
  const speakingReviewed = isManualSectionReviewed(
    examState.teacherReview.speakingScores,
    examState.teacherReview.speakingComment,
  )
  const finalReviewReady = writingReviewed && speakingReviewed
  const reviewedTotalScore = objectiveTotalScore + writingTeacherScore + speakingTeacherScore
  const reviewedMaxScore = objectiveMaxScore + 20 + 20
  const totalScore = finalReviewReady ? reviewedTotalScore : objectiveTotalScore
  const maxScore = finalReviewReady ? reviewedMaxScore : objectiveMaxScore
  const totalPercent = maxScore === 0 ? 0 : Math.round((totalScore / maxScore) * 100)
  const completion = getCompletionStatus(examState)
  const completedSkills = Object.values(completion).filter(Boolean).length
  const skillProgressPercent = Math.round((completedSkills / 4) * 100)
  const writingCompletedCount = examData.writing.tasks.filter((task) => isFilled(examState.writing[task.id])).length
  const speakingCompletedCount = examData.speaking.parts.filter(
    (part) => examState.speaking[part.id] && examState.speaking[part.id].recording,
  ).length
  const topRevisionPriority = revisionPriorities[0]?.tag || 'No urgent priority detected'
  const topStrength = strongestAreas[0]?.tag || 'Balanced objective profile'
  const readinessLabel =
    isExamLocked && !finalReviewReady
      ? examState.lockedReason === 'submitted'
        ? 'Exam submitted'
        : 'Time over'
      : finalReviewReady
        ? getReadinessLabel(totalScore, totalPercent)
        : 'Awaiting reviewer marks'
  const studentSummary = finalReviewReady
    ? `${examData.meta.studentName}'s full review is complete. The strongest objective area is ${topStrength.toLowerCase()}, and the clearest next revision focus is ${topRevisionPriority.toLowerCase()}.`
    : `${examData.meta.studentName}'s reading and listening have been scored. Writing and speaking remain pending until Ramazan reviews them.`
  const showPreExamFlow = currentSection === 'overview' && !hasActiveAttempt && !reviewRequested
  const reviewMode = reviewRequested
  const submittedEarly = isExamLocked && examState.lockedReason === 'submitted' && !timerExpired
  const isAuthorized = authStatus === 'ready'
  const syncStatusText =
    syncStatus === 'saving'
      ? 'Saving securely...'
      : syncStatus === 'error'
        ? syncError || 'Secure sync failed'
        : syncTimestamp
          ? `Saved ${formatTimestamp(syncTimestamp)}`
          : isAuthorized
            ? 'Secure sync ready'
            : 'Private access required'

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...getStorageSafeState(examState),
        currentSection,
        lastUpdatedAt: new Date().toISOString(),
      }),
    )
  }, [currentSection, examState])

  const persistAttemptImmediately = useCallback(async (nextState, nextSection = currentSection) => {
    if (!isAuthorized || !hasHydratedRemote) {
      return
    }

    if (remoteSyncTimeoutRef.current) {
      window.clearTimeout(remoteSyncTimeoutRef.current)
      remoteSyncTimeoutRef.current = null
    }

    const payload = {
      ...getStorageSafeState({
        ...nextState,
        currentSection: nextSection,
      }),
      currentSection: nextSection,
      lastUpdatedAt: new Date().toISOString(),
    }

    try {
      setSyncStatus('saving')
      setSyncError('')
      const savedAttempt = await saveAttemptRemote(remoteAttemptId, payload)
      setRemoteAttemptId(savedAttempt.id)
      setSyncTimestamp(savedAttempt.updated_at || payload.lastUpdatedAt)
      setSyncStatus('saved')
      lastRemoteComparableRef.current = getComparableState(payload)
    } catch (error) {
      setSyncStatus('error')
      setSyncError(error.message || 'The exam could not be saved securely.')
    }
  }, [currentSection, hasHydratedRemote, isAuthorized, remoteAttemptId])

  async function hydrateLatestAttempt({ keepCurrentSection = false } = {}) {
    setSyncError('')
    const attempt = await fetchLatestAttempt()

    if (!attempt) {
      setRemoteAttemptId('')
      setSyncTimestamp('')
      setHasHydratedRemote(true)
      setSyncStatus('saved')
      lastRemoteComparableRef.current = ''

      if (!keepCurrentSection) {
        if (reviewRequested) {
          setCurrentSection('results')
        } else if (hasStarted && !isExamLocked) {
          setCurrentSection(examState.currentSection || 'reading')
        } else {
          setCurrentSection('overview')
        }
      }

      return null
    }

    const nextState = mergeImportedState(attempt.payload || {})
    const nextSection =
      reviewRequested
        ? 'results'
        : nextState.startedAt && !nextState.lockedAt
          ? nextState.currentSection && nextState.currentSection !== 'results'
            ? nextState.currentSection
            : 'reading'
          : 'overview'

    setExamState(nextState)
    setRemoteAttemptId(attempt.id)
    setSyncTimestamp(attempt.updatedAt || nextState.lastUpdatedAt || '')
    setHasHydratedRemote(true)
    setSyncStatus('saved')
    lastRemoteComparableRef.current = getComparableState(nextState)

    if (!keepCurrentSection) {
      setCurrentSection(nextSection)
    }

    return attempt
  }

  useEffect(() => {
    const initialLocalState = initialStateRef.current

    async function restoreTrustedSession() {
      try {
        const session = await getCurrentSession()

        if (!session || !isTrustedSession(session)) {
          setAuthStatus('locked')
          setHasHydratedRemote(false)
          return
        }

        setAuthStatus('checking')
        setSyncError('')
        const attempt = await fetchLatestAttempt()

        if (!attempt) {
          setRemoteAttemptId('')
          setSyncTimestamp('')
          setHasHydratedRemote(true)
          setSyncStatus('saved')
          lastRemoteComparableRef.current = ''

          if (reviewRequested) {
            setCurrentSection('results')
          } else if (initialLocalState.startedAt && !initialLocalState.lockedAt) {
            setCurrentSection(initialLocalState.currentSection || 'reading')
          } else {
            setCurrentSection('overview')
          }

          setAuthStatus('ready')
          return
        }

        const nextState = mergeImportedState(attempt.payload || {})
        const nextSection =
          reviewRequested
            ? 'results'
            : nextState.startedAt && !nextState.lockedAt
              ? nextState.currentSection && nextState.currentSection !== 'results'
                ? nextState.currentSection
                : 'reading'
              : 'overview'

        setExamState(nextState)
        setRemoteAttemptId(attempt.id)
        setSyncTimestamp(attempt.updatedAt || nextState.lastUpdatedAt || '')
        setHasHydratedRemote(true)
        setSyncStatus('saved')
        lastRemoteComparableRef.current = getComparableState(nextState)
        setCurrentSection(nextSection)
        setAuthStatus('ready')
      } catch (error) {
        setAuthError(error.message || 'The private exam could not be opened.')
        setAuthStatus('locked')
        setHasHydratedRemote(false)
      }
    }

    restoreTrustedSession()
  }, [reviewRequested])

  useEffect(() => {
    if (!hasStarted || isExamLocked) {
      return undefined
    }

    const timerId = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => window.clearInterval(timerId)
  }, [hasStarted, isExamLocked])

  useEffect(() => {
    if (hasActiveAttempt && currentSection === 'overview') {
      setCurrentSection(examState.currentSection && examState.currentSection !== 'results' ? examState.currentSection : 'reading')
    }
  }, [currentSection, examState.currentSection, hasActiveAttempt])

  useEffect(() => {
    if (reviewRequested && currentSection === 'overview' && !hasActiveAttempt) {
      setCurrentSection('results')
    }
  }, [currentSection, hasActiveAttempt, reviewRequested])

  useEffect(() => {
    const metadataPlayers = examData.listening.sections.map((section) => {
      const player = new Audio(section.audioSrc)
      player.preload = 'metadata'

      const handleLoadedMetadata = () => {
        setAudioState((current) => ({
          ...current,
          [section.id]: {
            ...current[section.id],
            duration: Number.isFinite(player.duration) ? player.duration : current[section.id].duration,
          },
        }))
      }

      player.addEventListener('loadedmetadata', handleLoadedMetadata)

      return { player, handleLoadedMetadata }
    })

    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
      }

      metadataPlayers.forEach(({ player, handleLoadedMetadata }) => {
        player.removeEventListener('loadedmetadata', handleLoadedMetadata)
        player.src = ''
      })
    }
  }, [])

  useEffect(() => {
    if (!activeRecordingId) {
      setRecordingElapsedSeconds(0)
      return undefined
    }

    const timerId = window.setInterval(() => {
      setRecordingElapsedSeconds(Math.max(1, Math.round((Date.now() - recordingStartedAtRef.current) / 1000)))
    }, 1000)

    return () => window.clearInterval(timerId)
  }, [activeRecordingId])

  useEffect(() => {
    if (!timerExpired || examState.lockedAt) {
      return
    }

    if (audioRef.current) {
      const sectionId = activeListeningId
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current.src = ''
      audioRef.current = null

      if (sectionId) {
        setAudioState((current) => ({
          ...current,
          [sectionId]: {
            ...current[sectionId],
            currentTime: 0,
            isPlaying: false,
            hasFinished: false,
          },
        }))
      }
    }

    setActiveListeningId('')
    stopRecording()

    const nextState = {
      ...examState,
      currentSection: 'results',
      lockedAt: examState.lockedAt || new Date().toISOString(),
      lockedReason: examState.lockedReason || 'timeout',
    }

    setExamState(nextState)
    setCurrentSection('results')
    setShowSubmitPrompt(false)
    void persistAttemptImmediately(nextState, 'results')
  }, [timerExpired, examState, activeListeningId, persistAttemptImmediately])

  function stopListeningPlayback() {
    if (audioRef.current) {
      const sectionId = activeListeningId
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current.src = ''
      audioRef.current = null

      if (sectionId) {
        setAudioState((current) => ({
          ...current,
          [sectionId]: {
            ...current[sectionId],
            currentTime: 0,
            isPlaying: false,
            hasFinished: false,
          },
        }))
      }
    }

    setActiveListeningId('')
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
  }

  function lockExam(reason) {
    stopListeningPlayback()
    stopRecording()

    const nextState = {
      ...examState,
      currentSection: 'results',
      lockedAt: examState.lockedAt || new Date().toISOString(),
      lockedReason: examState.lockedReason || reason,
    }

    setExamState(nextState)
    setCurrentSection('results')
    setShowSubmitPrompt(false)
    void persistAttemptImmediately(nextState, 'results')
  }

  function updateAnswer(questionId, value) {
    if (isExamLocked) {
      return
    }

    setExamState((current) => ({
      ...current,
      answers: {
        ...current.answers,
        [questionId]: value,
      },
    }))
  }

  function updateWriting(taskId, value) {
    if (isExamLocked) {
      return
    }

    setExamState((current) => ({
      ...current,
      writing: {
        ...current.writing,
        [taskId]: value,
      },
    }))
  }

  function updateTeacherScore(group, criterionId, value) {
    const scoreKey = group === 'writing' ? 'writingScores' : 'speakingScores'

    setExamState((current) => ({
      ...current,
      teacherReview: {
        ...current.teacherReview,
        [scoreKey]: {
          ...current.teacherReview[scoreKey],
          [criterionId]: Number(value),
        },
        reviewedAt: new Date().toISOString(),
      },
    }))
  }

  function updateTeacherComment(field, value) {
    setExamState((current) => ({
      ...current,
      teacherReview: {
        ...current.teacherReview,
        [field]: value,
        reviewedAt: new Date().toISOString(),
      },
    }))
  }

  function goToSection(sectionId) {
    if (!hasStarted && sectionId !== 'results') {
      return
    }

    if (isExamLocked && sectionId !== 'results') {
      return
    }

    if (currentSection === 'listening' && sectionId !== 'listening') {
      stopListeningPlayback()
    }

    setExamState((current) => ({
      ...current,
      currentSection: sectionId,
    }))
    setCurrentSection(sectionId)
  }

  function startExam() {
    if (isExamLocked) {
      window.localStorage.removeItem(STORAGE_KEY)
    }

    const startedAt = new Date().toISOString()
    setNow(Date.now())
    setExamState({
      ...createInitialState(),
      currentSection: 'reading',
      startedAt,
      lockedAt: '',
      lockedReason: '',
    })
    setAudioState(createInitialAudioState())
    setListeningError('')
    setRecordingError('')
    setCurrentSection('reading')
    setIntroView('landing')
    setOverviewChecks({})
    setShowSubmitPrompt(false)
    setTeacherToolsOpen(reviewRequested)
  }

  function playListeningSection(section) {
    if (isExamLocked) {
      setListeningError('Time is over. The exam is locked.')
      return
    }

    if ((examState.playCounts[section.id] || 0) >= section.maxPlays) {
      setListeningError('Maximum playback count reached for this audio.')
      return
    }

    setListeningError('')
    stopListeningPlayback()

    setExamState((current) => ({
      ...current,
      playCounts: {
        ...current.playCounts,
        [section.id]: (current.playCounts[section.id] || 0) + 1,
      },
    }))
    setActiveListeningId(section.id)

    setAudioState((current) => ({
      ...current,
      [section.id]: {
        ...current[section.id],
        currentTime: 0,
        isPlaying: true,
        hasFinished: false,
      },
    }))

    const audio = new Audio(section.audioSrc)
    audioRef.current = audio
    audio.preload = 'auto'
    audio.playbackRate = 1
    audio.defaultPlaybackRate = 1

    audio.onloadedmetadata = () => {
      setAudioState((current) => ({
        ...current,
        [section.id]: {
          ...current[section.id],
          duration: Number.isFinite(audio.duration) ? audio.duration : current[section.id].duration,
        },
      }))
    }

    audio.ontimeupdate = () => {
      setAudioState((current) => ({
        ...current,
        [section.id]: {
          ...current[section.id],
          currentTime: audio.currentTime,
          duration: Number.isFinite(audio.duration) ? audio.duration : current[section.id].duration,
          isPlaying: true,
        },
      }))
    }

    audio.onended = () => {
      setAudioState((current) => ({
        ...current,
        [section.id]: {
          ...current[section.id],
          currentTime: current[section.id].duration || audio.duration || current[section.id].currentTime,
          duration: Number.isFinite(audio.duration) ? audio.duration : current[section.id].duration,
          isPlaying: false,
          hasFinished: true,
        },
      }))
      setActiveListeningId('')
      audioRef.current = null
    }

    audio.onerror = () => {
      setListeningError('The audio file could not be loaded.')
      setAudioState((current) => ({
        ...current,
        [section.id]: {
          ...current[section.id],
          isPlaying: false,
        },
      }))
      setActiveListeningId('')
      audioRef.current = null
    }

    audio.play().catch(() => {
      setListeningError('Playback was blocked by the browser.')
      setAudioState((current) => ({
        ...current,
        [section.id]: {
          ...current[section.id],
          isPlaying: false,
        },
      }))
      setActiveListeningId('')
      audioRef.current = null
    })
  }

  async function startRecording(partId) {
    if (isExamLocked) {
      setRecordingError('Time is over. The exam is locked.')
      return
    }

    if (activeRecordingId) {
      setRecordingError('Finish the current recording before starting another one.')
      return
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
      setRecordingError('This browser does not support microphone recording.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)

      mediaChunksRef.current = []
      mediaStreamRef.current = stream
      mediaRecorderRef.current = recorder
      recordingStartedAtRef.current = Date.now()

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          mediaChunksRef.current.push(event.data)
        }
      }

      recorder.onstop = async () => {
        const blob = new Blob(mediaChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        const durationSeconds = Math.max(1, Math.round((Date.now() - recordingStartedAtRef.current) / 1000))

        try {
          const uploadedRecording = await uploadSpeakingRecording({
            attemptId: remoteAttemptId,
            partId,
            blob,
          })

          setExamState((current) => ({
            ...current,
            speaking: {
              ...current.speaking,
              [partId]: {
                recording: {
                  dataUrl: null,
                  mimeType: blob.type || 'audio/webm',
                  name: `${partId}.${getRecordingFileExtension(blob.type || 'audio/webm')}`,
                  durationLabel: `${durationSeconds} sec`,
                  playbackUrl: uploadedRecording.playbackUrl,
                  storagePath: uploadedRecording.storagePath,
                },
              },
            },
          }))
          setRecordingError('')
        } catch (error) {
          const dataUrl = await blobToDataUrl(blob)

          setExamState((current) => ({
            ...current,
            speaking: {
              ...current.speaking,
              [partId]: {
                recording: {
                  dataUrl,
                  mimeType: blob.type || 'audio/webm',
                  name: `${partId}.${getRecordingFileExtension(blob.type || 'audio/webm')}`,
                  durationLabel: `${durationSeconds} sec`,
                  playbackUrl: null,
                  storagePath: null,
                },
              },
            },
          }))
          setRecordingError(
            error.message ||
              'The recording was captured locally, but the secure upload failed. Keep this tab open and record again before submitting.',
          )
        }

        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((track) => track.stop())
        }

        setActiveRecordingId('')
      }

      recorder.start()
      setRecordingError('')
      setActiveRecordingId(partId)
      setRecordingElapsedSeconds(0)
    } catch {
      setRecordingError('Microphone access was blocked. Please allow microphone permissions and try again.')
    }
  }

  async function deleteRecording(partId) {
    if (isExamLocked) {
      return
    }

    const currentRecording = examState.speaking[partId]?.recording

    if (currentRecording?.storagePath) {
      try {
        await deleteSpeakingRecording(currentRecording.storagePath)
      } catch (error) {
        setRecordingError(error.message || 'The saved recording could not be removed.')
        return
      }
    }

    setExamState((current) => ({
      ...current,
      speaking: {
        ...current.speaking,
        [partId]: {
          recording: null,
        },
      },
    }))
    setRecordingError('')
  }

  async function handleAccessSubmit(event) {
    event.preventDefault()

    const nextCode = accessCode.trim()
    if (!nextCode) {
      setAuthError('Enter the private access code to open the exam.')
      return
    }

    setAuthStatus('authenticating')
    setAuthError('')

    try {
      await openExamSession(nextCode, { reviewMode: reviewRequested })
      await hydrateLatestAttempt()
      setAuthStatus('ready')
    } catch (error) {
      setAuthError(error.message || 'The private exam could not be opened.')
      setAuthStatus('locked')
    }
  }

  async function refreshRemoteAttempt() {
    setSyncStatus('saving')

    try {
      await hydrateLatestAttempt({ keepCurrentSection: reviewRequested })
    } catch (error) {
      setSyncStatus('error')
      setSyncError(error.message || 'The latest attempt could not be loaded.')
    }
  }

  async function handleSignOut() {
    try {
      await signOutExamSession()
    } catch {
      // Ignore logout cleanup failures and force a clean local reset.
    } finally {
      window.localStorage.removeItem(STORAGE_KEY)
      window.location.reload()
    }
  }

  function nextSection() {
    const currentIndex = SECTION_ORDER.indexOf(currentSection)
    const next = SECTION_ORDER[currentIndex + 1]
    if (next) {
      goToSection(next)
      return
    }

    setShowSubmitPrompt(true)
  }

  function previousSection() {
    const currentIndex = SECTION_ORDER.indexOf(currentSection)
    const previous = SECTION_ORDER[currentIndex - 1]
    if (previous) {
      goToSection(previous)
    }
  }

  useEffect(() => {
    if (!isAuthorized || !hasHydratedRemote) {
      return undefined
    }

    const comparableState = getComparableState({
      ...examState,
      currentSection,
    })

    if (comparableState === lastRemoteComparableRef.current) {
      return undefined
    }

    setSyncStatus('saving')
    setSyncError('')

    const timeoutId = window.setTimeout(async () => {
      try {
        const payload = {
          ...getStorageSafeState({
            ...examState,
            currentSection,
          }),
          currentSection,
          lastUpdatedAt: new Date().toISOString(),
        }

        const savedAttempt = await saveAttemptRemote(remoteAttemptId, payload)
        setRemoteAttemptId(savedAttempt.id)
        setSyncTimestamp(savedAttempt.updated_at || payload.lastUpdatedAt)
        setSyncStatus('saved')
        lastRemoteComparableRef.current = comparableState
      } catch (error) {
        setSyncStatus('error')
        setSyncError(error.message || 'The exam could not be saved securely.')
      }
    }, REMOTE_SAVE_DEBOUNCE_MS)

    remoteSyncTimeoutRef.current = timeoutId

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [currentSection, examState, hasHydratedRemote, isAuthorized, remoteAttemptId])

  if (!isAuthorized) {
    return (
      <AccessGatePage
        accessCode={accessCode}
        authError={authError}
        authStatus={authStatus}
        isReviewMode={reviewRequested}
        onAccessCodeChange={setAccessCode}
        onSignIn={handleAccessSubmit}
      />
    )
  }

  if (showPreExamFlow) {
    return (
      <div className="exam-app">
        {introView === 'landing' ? (
          <LandingPage
            hasLockedAttempt={hasLockedAttempt}
            totalSectionPoints={totalSectionPoints}
            onContinue={() => setIntroView('overview')}
          />
        ) : (
          <OverviewPage
            allChecklistReady={allChecklistReady}
            checks={overviewChecks}
            hasLockedAttempt={hasLockedAttempt}
            onBack={() => setIntroView('landing')}
            onToggleCheck={(index) =>
              setOverviewChecks((current) => ({
                ...current,
                [index]: !current[index],
              }))
            }
            onBegin={startExam}
          />
        )}
      </div>
    )
  }

  return (
    <div className="exam-app">
      {currentSection !== 'results' && (
        <ExamNav
          currentSection={currentSection}
          isReviewMode={reviewRequested}
          onSignOut={handleSignOut}
          onSectionChange={goToSection}
          remainingSeconds={remainingSeconds}
          progressPercent={skillProgressPercent}
          completedSkills={completedSkills}
          isExamLocked={isExamLocked}
          onSubmit={() => setShowSubmitPrompt(true)}
          syncStatus={syncStatus}
          syncStatusText={syncStatusText}
        />
      )}

      <main className={`page-frame ${currentSection === 'results' ? 'results-frame' : ''}`}>
        {currentSection === 'reading' && (
          <ReadingSection
            answers={examState.answers}
            disabled={isExamLocked}
            onAnswer={updateAnswer}
            onContinue={nextSection}
          />
        )}

        {currentSection === 'listening' && (
          <ListeningSection
            activeListeningId={activeListeningId}
            answers={examState.answers}
            audioState={audioState}
            disabled={isExamLocked}
            error={listeningError}
            onAnswer={updateAnswer}
            onBack={previousSection}
            onContinue={nextSection}
            onPlay={playListeningSection}
            playCounts={examState.playCounts}
          />
        )}

        {currentSection === 'writing' && (
          <WritingSection
            disabled={isExamLocked}
            onBack={previousSection}
            onContinue={nextSection}
            onTextChange={updateWriting}
            texts={examState.writing}
          />
        )}

        {currentSection === 'speaking' && (
          <SpeakingSection
            activeRecordingId={activeRecordingId}
            disabled={isExamLocked}
            error={recordingError}
            onBack={previousSection}
            onContinue={() => setShowSubmitPrompt(true)}
            onDeleteRecording={deleteRecording}
            onStartRecording={startRecording}
            onStopRecording={stopRecording}
            recordingElapsedSeconds={recordingElapsedSeconds}
            recordings={examState.speaking}
          />
        )}

        {currentSection === 'results' && (
          <ResultsPage
            completion={completion}
            examState={examState}
            finalReviewReady={finalReviewReady}
            objectivePercent={objectivePercent}
            onPrint={() => window.print()}
            onRefresh={refreshRemoteAttempt}
            onSignOut={handleSignOut}
            onTeacherComment={updateTeacherComment}
            onTeacherScore={updateTeacherScore}
            readingScore={readingScore}
            readinessLabel={readinessLabel}
            reviewMode={reviewMode}
            revisionPriorities={revisionPriorities}
            speakingReviewed={speakingReviewed}
            speakingTeacherScore={speakingTeacherScore}
            studentSummary={studentSummary}
            strongestAreas={strongestAreas}
            submittedEarly={submittedEarly}
            totalPercent={totalPercent}
            totalScore={totalScore}
            maxScore={maxScore}
            writingReviewed={writingReviewed}
            writingTeacherScore={writingTeacherScore}
            listeningScore={listeningScore}
            onToggleTeacherTools={() => setTeacherToolsOpen((current) => !current)}
            syncStatus={syncStatus}
            syncStatusText={syncStatusText}
            teacherToolsOpen={teacherToolsOpen}
          />
        )}
      </main>

      {showSubmitPrompt && (
        <SubmitModal
          completion={completion}
          onClose={() => setShowSubmitPrompt(false)}
          onSubmit={() => lockExam('submitted')}
          remainingSeconds={remainingSeconds}
          speakingCount={speakingCompletedCount}
          writingCount={writingCompletedCount}
        />
      )}
    </div>
  )
}

function LandingPage({ hasLockedAttempt, onContinue, totalSectionPoints }) {
  return (
    <section className="landing-shell">
      <div className="landing-hero">
        <div className="landing-noise" />

        <div className="landing-topbar">
          <div className="landing-badge">
            <span className="landing-badge-icon">
              <Award size={15} />
            </span>
            <span>Private Exam</span>
          </div>

          <div className="landing-time-pill">
            <Clock size={14} />
            <span>{examData.meta.estimatedMinutes} min</span>
          </div>
        </div>

        <div className="landing-copy">
          <p className="landing-overline">Unit 45 Readiness</p>
          <h1>
            Galina&apos;s
            <br />
            <span>English Exam</span>
          </h1>
          <p className="landing-subtitle">{examData.meta.subtitle}</p>

          <div className="landing-focus-chips">
            {examData.meta.focusAreas.map((area) => (
              <span key={area}>{area}</span>
            ))}
          </div>
        </div>

        <div className="landing-footer">
          <div className="teacher-avatar">R</div>
          <div>
            <strong>Prepared by {examData.meta.teacherName}</strong>
            <span>{examData.meta.focusUnits}</span>
          </div>
        </div>
      </div>

      <div className="landing-panel">
        <div className="landing-panel-inner">
          <p className="panel-kicker">Exam Overview</p>

          <div className="landing-section-list">
            {examData.overview.sections.map((section) => {
              const theme = SECTION_THEMES[section.id]
              const Icon = theme.icon

              return (
                <article key={section.id} className="landing-section-card">
                  <div className="landing-section-icon" style={{ background: theme.soft, color: theme.accent }}>
                    <Icon size={18} />
                  </div>

                  <div className="landing-section-copy">
                    <div className="landing-section-head">
                      <strong>{section.title}</strong>
                      <div>
                        <span>{section.duration}</span>
                        <em>{section.points} pts</em>
                      </div>
                    </div>
                    <p>{section.description}</p>
                  </div>
                </article>
              )
            })}
          </div>

          <div className="landing-stats">
            <div>
              <strong>{totalSectionPoints}</strong>
              <span>Total Points</span>
            </div>
            <div>
              <strong>{examData.meta.passPercentage}%</strong>
              <span>Pass Score</span>
            </div>
            <div>
              <strong>3 hrs</strong>
              <span>Duration</span>
            </div>
          </div>

          <div className="landing-rules-card">
            <p>Key rules</p>
            <ul>
              {examData.overview.rules.slice(0, 4).map((rule) => (
                <li key={rule}>
                  <Star size={12} />
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
          </div>

          <button className="primary-cta" type="button" onClick={onContinue}>
            Review Exam & Begin
            <ChevronRight size={18} />
          </button>

          <p className="landing-note">
            Timer starts only after you press <strong>Start Exam</strong>.
          </p>

          {hasLockedAttempt && (
            <p className="landing-warning">
              A past attempt on this device is already closed. Starting again will create a fresh session.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

function OverviewPage({ allChecklistReady, checks, hasLockedAttempt, onBack, onToggleCheck, onBegin }) {
  return (
    <section className="overview-shell">
      <div className="overview-topbar">
        <button className="topbar-link" type="button" onClick={onBack}>
          <ChevronLeft size={16} />
          <span>Back</span>
        </button>

        <div className="topbar-status">
          <span className="status-dot" />
          <strong>Exam Overview</strong>
        </div>

        <button className="topbar-primary" disabled={!allChecklistReady} type="button" onClick={onBegin}>
          <Play size={14} />
          <span>Start Exam</span>
        </button>
      </div>

      <div className="overview-body">
        <header className="overview-header">
          <p className="overview-overline">Private IELTS-style test</p>
          <h2>Exam Brief</h2>
          <p>{examData.overview.intro}</p>
          <em>{examData.overview.introRu}</em>
        </header>

        <div className="overview-grid">
          <div className="overview-main">
            <section className="overview-card">
              <div className="overview-card-head">
                <Target size={16} />
                <strong>Exam Sections</strong>
              </div>

              <div className="overview-sections-grid">
                {examData.overview.sections.map((section) => {
                  const theme = SECTION_THEMES[section.id]
                  const Icon = theme.icon
                  return (
                    <article key={section.id} className="overview-section-card">
                      <div className="overview-section-top">
                        <div className="overview-section-icon" style={{ background: theme.soft, color: theme.accent }}>
                          <Icon size={18} />
                        </div>

                        <div className="overview-section-points" style={{ background: theme.soft, color: theme.accent }}>
                          {section.points} pts
                        </div>
                      </div>

                      <h3>{section.title}</h3>
                      <p className="section-translation">{section.titleRu}</p>
                      <p className="overview-section-description">{section.description}</p>
                      <span className="overview-section-duration">{section.duration}</span>
                    </article>
                  )
                })}
              </div>
            </section>

            <section className="overview-card">
              <div className="overview-card-head">
                <ShieldCheck size={16} />
                <strong>Exam Rules</strong>
              </div>

              <div className="overview-rules">
                {examData.overview.rules.map((rule, index) => (
                  <div key={rule} className="overview-rule-row">
                    <span>{index + 1}</span>
                    <p>{rule}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="mission-card">
              <p>A note from Ramazan</p>
              <strong>{examData.overview.mission}</strong>
            </section>
          </div>

          <aside className="overview-side">
            <section className="overview-card">
              <h3 className="side-heading">Pre-flight Checklist</h3>
              <p className="side-copy">Tick every item before the exam begins.</p>

              <div className="checklist-list">
                {examData.overview.preflightChecklist.map((item, index) => {
                  const checked = checks[index]
                  return (
                    <button
                      key={item}
                      className={`checklist-row ${checked ? 'checked' : ''}`}
                      type="button"
                      onClick={() => onToggleCheck(index)}
                    >
                      {checked ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                      <span>{item}</span>
                    </button>
                  )
                })}
              </div>

              <div className="checklist-progress">
                <div className="checklist-progress-copy">
                  <span>Ready to begin?</span>
                  <strong>
                    {Object.values(checks).filter(Boolean).length}/{examData.overview.preflightChecklist.length}
                  </strong>
                </div>
                <div className="checklist-progress-track">
                  <div
                    className="checklist-progress-fill"
                    style={{
                      width: `${(Object.values(checks).filter(Boolean).length / examData.overview.preflightChecklist.length) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </section>

            <section className="overview-card">
              <h3 className="side-heading">At a Glance</h3>
              <div className="overview-meta-list">
                {[
                  { label: 'Student', value: examData.meta.studentName },
                  { label: 'Teacher', value: examData.meta.teacherName },
                  { label: 'Duration', value: `${examData.meta.estimatedMinutes} minutes` },
                  { label: 'Total points', value: '80 points' },
                  { label: 'Pass threshold', value: `${examData.meta.passPercentage}%` },
                  { label: 'Auto-graded', value: 'Reading + Listening' },
                  { label: 'Manual review', value: 'Writing + Speaking' },
                ].map((item) => (
                  <div key={item.label} className="overview-meta-row">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            </section>

            <button className="primary-cta large" disabled={!allChecklistReady} type="button" onClick={onBegin}>
              <Play size={16} />
              <span>{allChecklistReady ? 'Start Exam — Timer Begins' : 'Complete checklist to start'}</span>
            </button>

            {!allChecklistReady && <p className="landing-note compact">Tick all checklist items above.</p>}
            {hasLockedAttempt && (
              <p className="landing-warning compact">A previous attempt is already closed on this device.</p>
            )}
          </aside>
        </div>
      </div>
    </section>
  )
}

function AccessGatePage({ accessCode, authError, authStatus, isReviewMode, onAccessCodeChange, onSignIn }) {
  const isBusy = authStatus === 'checking' || authStatus === 'authenticating'

  return (
    <section className="access-shell">
      <div className="access-hero">
        <div className="landing-noise" />

        <div className="access-badge">
          <span className="landing-badge-icon">
            <ShieldCheck size={16} />
          </span>
          <div>
            <strong>Private Exam Access</strong>
            <span>{isReviewMode ? 'Reviewer entry' : 'Student entry'}</span>
          </div>
        </div>

        <div className="access-copy">
          <p className="landing-overline">Secure entry</p>
          <h1>{isReviewMode ? 'Reviewer access' : "Galina's exam space"}</h1>
          <p className="landing-subtitle">
            Enter the private code from Ramazan to open the live exam session. The same secure session is used for
            autosave, speaking recordings, and reviewer scoring.
          </p>
          <p className="access-copy-ru">Введите код доступа, чтобы открыть экзамен и сохранить ответы автоматически.</p>
        </div>
      </div>

      <div className="access-panel">
        <form className="access-card" onSubmit={onSignIn}>
          <p className="panel-kicker">{isReviewMode ? 'Review Mode' : 'Exam Mode'}</p>
          <h2>{isBusy ? 'Opening secure session...' : 'Enter access code'}</h2>
          <p className="access-note">Nothing is shown before the private session opens.</p>

          <label className="access-field">
            <span>Access code</span>
            <input
              autoComplete="current-password"
              className="answer-input access-input"
              disabled={isBusy}
              placeholder="Enter the private code"
              type="password"
              value={accessCode}
              onChange={(event) => onAccessCodeChange(event.target.value)}
            />
          </label>

          {authError && <p className="error-banner access-error">{authError}</p>}

          <button className="primary-cta" disabled={isBusy} type="submit">
            <ShieldCheck size={16} />
            <span>{isBusy ? 'Opening secure session' : 'Open private exam'}</span>
          </button>

          <div className="access-meta">
            <div>
              <strong>Auto-save</strong>
              <span>Answers and speaking recordings are stored remotely.</span>
            </div>
            <div>
              <strong>Review</strong>
              <span>Ramazan reviews writing and speaking directly in the same session.</span>
            </div>
          </div>
        </form>
      </div>
    </section>
  )
}

function ExamNav({
  currentSection,
  isReviewMode,
  onSignOut,
  onSectionChange,
  remainingSeconds,
  progressPercent,
  completedSkills,
  isExamLocked,
  onSubmit,
  syncStatus,
  syncStatusText,
}) {
  const isUrgent = remainingSeconds <= 600
  const isCritical = remainingSeconds <= 180

  return (
    <header className="exam-nav">
      <div className="exam-nav-inner">
        <div className="exam-brand">
          <strong>Unit 45 Exam</strong>
          <span>{examData.meta.studentName}</span>
        </div>

        <nav className="exam-tabs" aria-label="Exam sections">
          {SECTION_ORDER.map((sectionId) => {
            const theme = SECTION_THEMES[sectionId]
            const Icon = theme.icon
            const label = examData.overview.sections.find((section) => section.id === sectionId)?.title || sectionId
            const isActive = currentSection === sectionId

            return (
              <button
                key={sectionId}
                className={`exam-tab ${isActive ? 'active' : ''}`}
                style={isActive ? { background: `linear-gradient(135deg, ${theme.accent}, ${theme.accent}dd)` } : undefined}
                type="button"
                onClick={() => onSectionChange(sectionId)}
              >
                <Icon size={15} />
                <span>{label}</span>
              </button>
            )
          })}
        </nav>

        <div className={`timer-box ${isCritical ? 'critical' : isUrgent ? 'urgent' : ''} ${isExamLocked ? 'locked' : ''}`}>
          {isCritical ? <AlertTriangle size={14} /> : <Clock size={14} />}
          <strong>{isExamLocked ? 'Locked' : formatCountdown(remainingSeconds)}</strong>
        </div>

        <div className="exam-nav-actions">
          <div className={`sync-pill ${syncStatus === 'error' ? 'error' : syncStatus === 'saving' ? 'saving' : ''}`}>
            <span className="status-dot" />
            <strong>{syncStatusText}</strong>
          </div>

          {isReviewMode && (
            <button className="ghost-action nav-ghost" type="button" onClick={onSignOut}>
              <X size={14} />
              <span>Close review</span>
            </button>
          )}

          {!isReviewMode && (
            <button className="submit-button" type="button" onClick={onSubmit}>
              <Send size={14} />
              <span>Submit</span>
            </button>
          )}
        </div>
      </div>

      <div className="exam-progress-track" aria-hidden="true">
        <div className="exam-progress-fill" style={{ width: `${progressPercent}%` }} />
      </div>

      <div className="exam-progress-copy">
        <span>{progressPercent}% complete</span>
        <strong>{completedSkills} of 4 sections finished</strong>
      </div>
    </header>
  )
}

function ReadingSection({ answers, disabled, onAnswer, onContinue }) {
  const [openPassage, setOpenPassage] = useState(examData.reading.passages[0]?.id || '')
  const [showStrategy, setShowStrategy] = useState(false)
  const totalAnswered = examData.reading.passages.flatMap((passage) => passage.questions).filter((question) => answers[question.id]).length
  const totalQuestions = examData.reading.passages.flatMap((passage) => passage.questions).length
  return (
    <section className="section-shell">
      <SectionHeader
        accent={SECTION_THEMES.reading.accent}
        icon={<BookOpen size={18} />}
        label="Reading"
        pointsLabel="Points"
        secondaryMetric={`${totalAnswered}/${totalQuestions}`}
        secondaryLabel="Answered"
        translation="Чтение"
        valueLabel="20"
      />

      <p className="section-intro">{examData.reading.instruction}</p>

      <StrategyDrawer
        items={examData.reading.checklist}
        open={showStrategy}
        strategy={examData.reading.strategy}
        title="Coach Strategy"
        onToggle={() => setShowStrategy((current) => !current)}
      />

      <div className="section-stack">
        {examData.reading.passages.map((passage, passagePosition) => {
          const answeredCount = passage.questions.filter((question) => isFilled(answers[question.id])).length
          const isOpen = openPassage === passage.id

          return (
            <article key={passage.id} className="section-card">
              <button className="section-card-toggle" type="button" onClick={() => setOpenPassage(isOpen ? '' : passage.id)}>
                <div className="section-card-title">
                  <span>{passagePosition + 1}</span>
                  <div>
                    <strong>{passage.title}</strong>
                    <em>
                      {answeredCount}/{passage.questions.length} questions answered
                    </em>
                  </div>
                </div>

                <div className="section-card-dots">
                  {passage.questions.map((question) => (
                    <i key={question.id} className={answers[question.id] ? 'filled' : ''} />
                  ))}
                  {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </button>

              {isOpen && (
                <div className="section-card-body">
                  <div className="reading-passage">
                    <p className="passage-label">Passage Text</p>
                    <div className="reading-copy">
                      {passage.text.map((paragraph) => (
                        <p key={paragraph}>{paragraph}</p>
                      ))}
                    </div>
                  </div>

                  <div className="question-list">
                    {passage.questions.map((question, questionPosition) => {
                      const questionOffset = examData.reading.passages
                        .slice(0, passagePosition)
                        .reduce((sum, item) => sum + item.questions.length, 0)
                      return (
                        <QuestionCard
                          key={question.id}
                          disabled={disabled}
                          index={questionOffset + questionPosition + 1}
                          question={question}
                          value={answers[question.id]}
                          onChange={onAnswer}
                        />
                      )
                    })}
                  </div>
                </div>
              )}
            </article>
          )
        })}
      </div>

      <SectionFooter canGoBack={false} onBack={null} onContinue={onContinue} continueLabel="Continue to listening" />
    </section>
  )
}

function ListeningSection({
  activeListeningId,
  answers,
  audioState,
  disabled,
  error,
  onAnswer,
  onBack,
  onContinue,
  onPlay,
  playCounts,
}) {
  const [openTrack, setOpenTrack] = useState(examData.listening.sections[0]?.id || '')
  const [showStrategy, setShowStrategy] = useState(false)
  const totalAnswered = examData.listening.sections.flatMap((section) => section.questions).filter((question) => answers[question.id]).length
  const totalQuestions = examData.listening.sections.flatMap((section) => section.questions).length
  return (
    <section className="section-shell">
      <SectionHeader
        accent={SECTION_THEMES.listening.accent}
        icon={<Headphones size={18} />}
        label="Listening"
        pointsLabel="Points"
        secondaryMetric={`${totalAnswered}/${totalQuestions}`}
        secondaryLabel="Answered"
        translation="Аудирование"
        valueLabel="20"
      />

      <p className="section-intro">{examData.listening.instruction}</p>

      <div className="warning-card listening-warning">
        <AlertCircle size={16} />
        <p>{examData.listening.coachNote}</p>
      </div>

      <StrategyDrawer
        items={examData.listening.checklist}
        open={showStrategy}
        strategy={examData.listening.strategy}
        title="Coach Strategy"
        onToggle={() => setShowStrategy((current) => !current)}
      />

      {error && <p className="error-banner">{error}</p>}

      <div className="section-stack">
        {examData.listening.sections.map((section, sectionPosition) => {
          const answeredCount = section.questions.filter((question) => isFilled(answers[question.id])).length
          const isOpen = openTrack === section.id

          return (
            <article key={section.id} className="section-card">
              <button className="section-card-toggle" type="button" onClick={() => setOpenTrack(isOpen ? '' : section.id)}>
                <div className="section-card-title">
                  <span className="blue">{sectionPosition + 1}</span>
                  <div>
                    <strong>{section.title}</strong>
                    <em>
                      {answeredCount}/{section.questions.length} questions answered
                    </em>
                  </div>
                </div>

                <div className="section-card-dots">
                  {section.questions.map((question) => (
                    <i key={question.id} className={answers[question.id] ? 'filled blue' : 'blue'} />
                  ))}
                  {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </button>

              {isOpen && (
                <div className="section-card-body">
                  <ListeningPlayer
                    activeListeningId={activeListeningId}
                    audioState={audioState[section.id]}
                    disabled={disabled}
                    playCount={playCounts[section.id] || 0}
                    section={section}
                    onPlay={() => onPlay(section)}
                  />

                  <div className="question-list">
                    {section.questions.map((question, questionPosition) => {
                      const questionOffset = examData.listening.sections
                        .slice(0, sectionPosition)
                        .reduce((sum, item) => sum + item.questions.length, 0)
                      return (
                        <QuestionCard
                          key={question.id}
                          disabled={disabled}
                          index={questionOffset + questionPosition + 1}
                          question={question}
                          value={answers[question.id]}
                          onChange={onAnswer}
                        />
                      )
                    })}
                  </div>
                </div>
              )}
            </article>
          )
        })}
      </div>

      <SectionFooter canGoBack onBack={onBack} onContinue={onContinue} continueLabel="Continue to writing" />
    </section>
  )
}

function WritingSection({ disabled, onBack, onContinue, onTextChange, texts }) {
  const [showStrategy, setShowStrategy] = useState(false)
  const totalWords = examData.writing.tasks.reduce((sum, task) => sum + countWords(texts[task.id] || ''), 0)
  const tasksStarted = examData.writing.tasks.filter((task) => isFilled(texts[task.id] || '')).length

  return (
    <section className="section-shell">
      <SectionHeader
        accent={SECTION_THEMES.writing.accent}
        icon={<PenLine size={18} />}
        label="Writing"
        pointsLabel="Total words"
        secondaryMetric={`${tasksStarted}/${examData.writing.tasks.length}`}
        secondaryLabel="Started"
        translation="Письмо"
        valueLabel={String(totalWords)}
      />

      <p className="section-intro">{examData.writing.instruction}</p>

      <StrategyDrawer
        items={examData.writing.checklist}
        open={showStrategy}
        strategy={examData.writing.strategy}
        title="Coach Strategy"
        onToggle={() => setShowStrategy((current) => !current)}
      />

      <div className="warning-card writing-warning">
        <CheckCircle2 size={16} />
        <p>
          <strong>Manual review:</strong> {examData.writing.coachNote}
        </p>
      </div>

      <div className="section-stack">
        {examData.writing.tasks.map((task) => (
          <WritingTaskCard
            key={task.id}
            disabled={disabled}
            task={task}
            text={texts[task.id] || ''}
            onTextChange={onTextChange}
          />
        ))}
      </div>

      <section className="rubric-card">
        <strong>Assessment Rubric</strong>
        <div className="rubric-grid">
          {examData.writing.rubric.map((criterion) => (
            <article key={criterion.id}>
              <h4>{criterion.label}</h4>
              <p>{criterion.labelRu}</p>
            </article>
          ))}
        </div>
      </section>

      <SectionFooter canGoBack onBack={onBack} onContinue={onContinue} continueLabel="Continue to speaking" />
    </section>
  )
}

function SpeakingSection({
  activeRecordingId,
  disabled,
  error,
  onBack,
  onContinue,
  onDeleteRecording,
  onStartRecording,
  onStopRecording,
  recordingElapsedSeconds,
  recordings,
}) {
  const [showStrategy, setShowStrategy] = useState(false)
  const recordedCount = examData.speaking.parts.filter((part) => recordings[part.id] && recordings[part.id].recording).length

  return (
    <section className="section-shell">
      <SectionHeader
        accent={SECTION_THEMES.speaking.accent}
        icon={<Mic size={18} />}
        label="Speaking"
        pointsLabel="Points"
        secondaryMetric={`${recordedCount}/${examData.speaking.parts.length}`}
        secondaryLabel="Recorded"
        translation="Говорение"
        valueLabel="20"
      />

      <p className="section-intro">{examData.speaking.instruction}</p>

      <div className="warning-card speaking-warning">
        <Mic size={16} />
        <p>{examData.speaking.browserNote}</p>
      </div>

      <StrategyDrawer
        items={examData.speaking.checklist}
        open={showStrategy}
        strategy={examData.speaking.strategy}
        title="Coach Strategy"
        onToggle={() => setShowStrategy((current) => !current)}
      />

      {error && <p className="error-banner">{error}</p>}

      <div className="section-stack">
        {examData.speaking.parts.map((part) => {
          const recording = recordings[part.id]?.recording || null
          const isRecording = activeRecordingId === part.id

          return (
            <article key={part.id} className="task-card speaking-card">
              <div className="task-head">
                <div>
                  <h3>{part.title}</h3>
                  <p>{part.duration}</p>
                </div>

                {recording && (
                  <span className="task-status success">
                    <CheckCircle2 size={14} />
                    Recorded
                  </span>
                )}
              </div>

              <div className="task-prompt-box">
                <p>{part.prompt}</p>
              </div>

              <div className="follow-up-list">
                {part.followUps.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>

              <div className="recording-row">
                {!isRecording ? (
                  <button
                    className="record-button"
                    disabled={disabled}
                    type="button"
                    onClick={() => onStartRecording(part.id)}
                  >
                    <Mic size={16} />
                    <span>{recording ? 'Record Again' : 'Start Recording'}</span>
                  </button>
                ) : (
                  <button className="record-button live" type="button" onClick={onStopRecording}>
                    <Square size={16} />
                    <span>Stop Recording</span>
                  </button>
                )}

                {isRecording && (
                  <div className="record-live-badge">
                    <i />
                    <span>{formatDuration(recordingElapsedSeconds)}</span>
                  </div>
                )}

                {recording && !isRecording && (
                  <button className="ghost-action" disabled={disabled} type="button" onClick={() => onDeleteRecording(part.id)}>
                    <Trash2 size={15} />
                    <span>Re-record</span>
                  </button>
                )}
              </div>

              {recording && getRecordingSource(recording) && (
                <div className="recording-playback">
                  <span>Your recording ({recording.durationLabel})</span>
                  <audio controls src={getRecordingSource(recording)}>
                    Your browser does not support audio playback.
                  </audio>
                </div>
              )}
            </article>
          )
        })}
      </div>

      <section className="rubric-card">
        <strong>Speaking Assessment Rubric</strong>
        <div className="rubric-grid">
          {examData.speaking.rubric.map((criterion) => (
            <article key={criterion.id} className="purple">
              <h4>{criterion.label}</h4>
              <p>{criterion.labelRu}</p>
            </article>
          ))}
        </div>
      </section>

      <SectionFooter canGoBack onBack={onBack} onContinue={onContinue} continueLabel="Review & submit" />
    </section>
  )
}

function ResultsPage({
  completion,
  examState,
  finalReviewReady,
  objectivePercent,
  onPrint,
  onRefresh,
  onSignOut,
  onTeacherComment,
  onTeacherScore,
  readingScore,
  readinessLabel,
  reviewMode,
  revisionPriorities,
  speakingReviewed,
  speakingTeacherScore,
  studentSummary,
  strongestAreas,
  submittedEarly,
  totalPercent,
  totalScore,
  maxScore,
  writingReviewed,
  writingTeacherScore,
  listeningScore,
  onToggleTeacherTools,
  syncStatus,
  syncStatusText,
  teacherToolsOpen,
}) {
  const displayPercent = finalReviewReady ? totalPercent : objectivePercent
  const displayScore = finalReviewReady ? `${totalScore}/${maxScore}` : `${readingScore.earned + listeningScore.earned}/${readingScore.possible + listeningScore.possible}`
  const statusTone = displayPercent >= examData.meta.passPercentage ? '#c59a4a' : '#c0394a'
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  const sectionResults = [
    {
      id: 'reading',
      label: 'Reading',
      labelRu: 'Чтение',
      icon: BookOpen,
      score: readingScore.earned,
      max: readingScore.possible,
      color: SECTION_THEMES.reading.accent,
      soft: SECTION_THEMES.reading.soft,
      border: SECTION_THEMES.reading.border,
      mode: 'auto',
    },
    {
      id: 'listening',
      label: 'Listening',
      labelRu: 'Аудирование',
      icon: Headphones,
      score: listeningScore.earned,
      max: listeningScore.possible,
      color: SECTION_THEMES.listening.accent,
      soft: SECTION_THEMES.listening.soft,
      border: SECTION_THEMES.listening.border,
      mode: 'auto',
    },
    {
      id: 'writing',
      label: 'Writing',
      labelRu: 'Письмо',
      icon: PenLine,
      score: writingReviewed ? writingTeacherScore : null,
      max: 20,
      color: SECTION_THEMES.writing.accent,
      soft: SECTION_THEMES.writing.soft,
      border: SECTION_THEMES.writing.border,
      mode: writingReviewed ? 'reviewed' : 'manual',
      note: writingReviewed ? 'Reviewer marks saved' : 'Pending reviewer marks',
    },
    {
      id: 'speaking',
      label: 'Speaking',
      labelRu: 'Говорение',
      icon: Mic,
      score: speakingReviewed ? speakingTeacherScore : null,
      max: 20,
      color: SECTION_THEMES.speaking.accent,
      soft: SECTION_THEMES.speaking.soft,
      border: SECTION_THEMES.speaking.border,
      mode: speakingReviewed ? 'reviewed' : 'manual',
      note: speakingReviewed ? 'Reviewer marks saved' : 'Pending reviewer marks',
    },
  ]

  return (
    <section className="results-shell">
      <header className="results-hero">
        <div className="results-hero-copy">
          <div className="results-hero-badge">
            <span className="landing-badge-icon gold">
              <Award size={18} />
            </span>
            <div>
              <span>Exam Complete</span>
              <strong>{today}</strong>
            </div>
          </div>

          <h2>{examData.meta.studentName}&apos;s Results</h2>
          <p>{examData.meta.subtitle}</p>
          <p className="results-disclaimer">Private readiness summary only. This is not an official IELTS result.</p>
        </div>

        <div className="results-score-shell">
          <div
            className="results-score-ring"
            style={{
              '--score-color': statusTone,
              '--score-percent': `${displayPercent}%`,
            }}
          >
            <div className="results-score-inner">
              <strong>{displayPercent}%</strong>
              <span>{finalReviewReady ? 'full review' : 'auto-graded'}</span>
            </div>
          </div>

          <div className="results-score-note" style={{ color: statusTone }}>
            {displayPercent >= examData.meta.passPercentage ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            <strong>{displayScore}</strong>
          </div>
        </div>
      </header>

      {submittedEarly && (
        <div className="results-banner submitted">
          <CheckCircle2 size={18} />
          <div>
            <strong>Exam submitted.</strong>
            <p>Galina ended the session before the 3-hour timer finished.</p>
          </div>
        </div>
      )}

      {examState.lockedReason === 'timeout' && (
        <div className="results-banner timeout">
          <AlertTriangle size={18} />
          <div>
            <strong>Time is over.</strong>
            <p>The session closed automatically when the 3-hour timer ended.</p>
          </div>
        </div>
      )}

      <section className="results-summary-card">
        <h3>Session complete</h3>
        <p>{studentSummary}</p>
      </section>

      <section className="results-breakdown">
        {sectionResults.map((section) => {
          const Icon = section.icon
          const percent = section.score === null ? null : Math.round((section.score / section.max) * 100)
          return (
            <article key={section.id} className="result-card" style={{ borderColor: section.border }}>
              <div className="result-card-head">
                <div className="result-card-title">
                  <span style={{ background: section.soft, color: section.color }}>
                    <Icon size={16} />
                  </span>
                  <div>
                    <strong>{section.label}</strong>
                    <em>{section.labelRu}</em>
                  </div>
                </div>

                {section.score === null ? (
                  <div className="pending-pill">Pending review</div>
                ) : (
                  <div className="result-score-box">
                    <strong style={{ color: section.color }}>
                      {section.score}/{section.max}
                    </strong>
                    <span>{percent}%</span>
                  </div>
                )}
              </div>

              {section.score === null ? (
                <p className="result-note">{section.note}</p>
              ) : (
                <>
                  <div className="mini-progress">
                    <div className="mini-progress-fill" style={{ width: `${percent}%`, background: section.color }} />
                  </div>
                  <p className="result-note" style={{ color: section.color }}>
                    {percent >= examData.meta.passPercentage ? 'Passed section threshold' : 'Below pass threshold'}
                  </p>
                </>
              )}
            </article>
          )
        })}
      </section>

      <div className="analysis-grid">
        <section className="analysis-card">
          <h3>Next revision focus</h3>
          <div className="analysis-list">
            {revisionPriorities.length > 0 ? (
              revisionPriorities.map((item) => (
                <article key={item.tag}>
                  <div>
                    <strong>{item.tag}</strong>
                    <span>{item.percent}%</span>
                  </div>
                  <p>
                    {item.earned}/{item.possible} points across {item.totalQuestions} tasks
                  </p>
                </article>
              ))
            ) : (
              <p className="result-note">No urgent low-scoring grammar area appeared in the auto-scored sections.</p>
            )}
          </div>
        </section>

        <section className="analysis-card">
          <h3>Most confident areas</h3>
          <div className="analysis-list">
            {strongestAreas.map((item) => (
              <article key={item.tag} className="strong">
                <div>
                  <strong>{item.tag}</strong>
                  <span>{item.percent}%</span>
                </div>
                <p>
                  {item.earned}/{item.possible} points across {item.totalQuestions} tasks
                </p>
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className="results-meta-card">
        <div>
          <span>{finalReviewReady ? 'Total score' : 'Current score'}</span>
          <strong>
            {totalScore}/{maxScore}
          </strong>
        </div>
        <div>
          <span>{finalReviewReady ? 'Percent' : 'Auto-graded percent'}</span>
          <strong>{finalReviewReady ? `${totalPercent}%` : `${objectivePercent}%`}</strong>
        </div>
        <div>
          <span>{finalReviewReady ? 'Pass line' : 'Final review'}</span>
          <strong>{finalReviewReady ? `${examData.meta.passPercentage}%` : 'Writing + speaking pending'}</strong>
        </div>
      </section>

      <section className="certificate-card print-area">
        <div className="certificate-head">
          <div>
            <p>{examData.meta.certificateTitle}</p>
            <div className="certificate-stars">
              {Array.from({ length: 5 }).map((_, index) => (
                <Star key={index} size={14} />
              ))}
            </div>
          </div>
          <span className="certificate-medal">
            <Award size={26} />
          </span>
        </div>

        <span className="certificate-label">This certifies that</span>
        <h3>{examData.meta.studentName}</h3>
        <p className="certificate-subtitle">{examData.meta.certificateSubtitle}</p>

        <div className="certificate-stats">
          {[
            { label: 'Exam title', value: 'Unit 45 Readiness' },
            { label: 'Status', value: readinessLabel },
            { label: 'Date', value: today },
            { label: 'Teacher', value: examData.meta.teacherName },
          ].map((item) => (
            <div key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>

        <p className="certificate-footer">{examData.meta.certificateFooter}</p>

        <div className="certificate-actions">
          <button className="primary-cta slim" type="button" onClick={onPrint}>
            <Printer size={16} />
            <span>Print Certificate</span>
          </button>
        </div>
      </section>

      {reviewMode && (
        <section className="reviewer-shell">
          <div className="reviewer-topbar">
            <div>
              <h3>Reviewer Tools</h3>
              <p>{syncStatusText}</p>
            </div>

            <div className="reviewer-actions">
              <button className="ghost-action" type="button" onClick={onRefresh}>
                <Clock size={16} />
                <span>Refresh latest session</span>
              </button>

              <button className="ghost-action" type="button" onClick={onToggleTeacherTools}>
                {teacherToolsOpen ? <X size={16} /> : <ChevronDown size={16} />}
                <span>{teacherToolsOpen ? 'Hide Reviewer Panel' : 'Show Reviewer Panel'}</span>
              </button>

              <button className="ghost-action" type="button" onClick={onSignOut}>
                <ShieldCheck size={16} />
                <span>Close reviewer session</span>
              </button>
            </div>
          </div>

          {syncStatus === 'error' && <p className="error-banner">Reviewer sync needs attention. Try refreshing the latest session.</p>}

          {teacherToolsOpen && (
            <>
              <div className="review-grid">
                <section className="review-card">
                  <h4>Writing review</h4>
                  {examData.writing.rubric.map((criterion) => (
                    <RubricSlider
                      key={criterion.id}
                      criterion={criterion}
                      value={examState.teacherReview.writingScores[criterion.id]}
                      onChange={(value) => onTeacherScore('writing', criterion.id, value)}
                    />
                  ))}
                  <textarea
                    className="review-textarea"
                    rows={5}
                    value={examState.teacherReview.writingComment}
                    onChange={(event) => onTeacherComment('writingComment', event.target.value)}
                    placeholder="Writing feedback for Galina..."
                  />
                </section>

                <section className="review-card">
                  <h4>Speaking review</h4>
                  {examData.speaking.rubric.map((criterion) => (
                    <RubricSlider
                      key={criterion.id}
                      criterion={criterion}
                      value={examState.teacherReview.speakingScores[criterion.id]}
                      onChange={(value) => onTeacherScore('speaking', criterion.id, value)}
                    />
                  ))}
                  <textarea
                    className="review-textarea"
                    rows={5}
                    value={examState.teacherReview.speakingComment}
                    onChange={(event) => onTeacherComment('speakingComment', event.target.value)}
                    placeholder="Speaking feedback for Galina..."
                  />
                </section>
              </div>

              <section className="review-card">
                <h4>Speaking recordings</h4>
                <div className="review-audio-list">
                  {examData.speaking.parts.map((part) => {
                    const recording = examState.speaking[part.id]?.recording
                    return (
                      <article key={part.id} className="review-audio-card">
                        <div>
                          <strong>{part.title}</strong>
                          <p>{part.prompt}</p>
                        </div>
                        {recording && getRecordingSource(recording) ? (
                          <audio controls src={getRecordingSource(recording)}>
                            Your browser does not support audio playback.
                          </audio>
                        ) : (
                          <span className="pending-pill">No recording saved</span>
                        )}
                      </article>
                    )
                  })}
                </div>
              </section>

              <section className="review-card">
                <h4>Overall reviewer summary</h4>
                <textarea
                  className="review-textarea"
                  rows={5}
                  value={examState.teacherReview.overallComment}
                  onChange={(event) => onTeacherComment('overallComment', event.target.value)}
                  placeholder="Overall next steps, strengths, and revision focus..."
                />
                <p className="review-timestamp">Reviewed: {formatTimestamp(examState.teacherReview.reviewedAt)}</p>
              </section>
            </>
          )}
        </section>
      )}

      {!reviewMode && (
        <section className="student-finish-note">
          <span>Completion</span>
          <strong>{Object.values(completion).every(Boolean) ? 'All sections finished' : 'Session ended before all sections were completed'}</strong>
        </section>
      )}
    </section>
  )
}

function SubmitModal({ completion, onClose, onSubmit, remainingSeconds, speakingCount, writingCount }) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-card">
        <button className="modal-close" type="button" onClick={onClose}>
          <X size={16} />
        </button>

        <span className="modal-icon">
          <AlertTriangle size={24} />
        </span>
        <h3>Submit Exam?</h3>
        <p>This will end the session immediately, lock all answers, and open the results screen.</p>

        <div className="modal-status">
          {[
            {
              label: 'Reading',
              detail: completion.reading ? 'completed' : 'still in progress',
              done: completion.reading,
            },
            {
              label: 'Listening',
              detail: completion.listening ? 'completed' : 'still in progress',
              done: completion.listening,
            },
            {
              label: 'Writing',
              detail: `${writingCount}/${examData.writing.tasks.length} tasks started`,
              done: completion.writing,
            },
            {
              label: 'Speaking',
              detail: `${speakingCount}/${examData.speaking.parts.length} recordings saved`,
              done: completion.speaking,
            },
          ].map((item) => (
            <div key={item.label} className="modal-status-row">
              <div>
                <span className={`status-dot-large ${item.done ? 'done' : ''}`} />
                <strong>{item.label}</strong>
              </div>
              <p>{item.detail}</p>
            </div>
          ))}
        </div>

        <p className="modal-time">Time remaining: {formatCountdown(remainingSeconds)}</p>

        <div className="modal-actions">
          <button className="ghost-action" type="button" onClick={onClose}>
            Continue Exam
          </button>
          <button className="primary-cta slim" type="button" onClick={onSubmit}>
            <Send size={16} />
            <span>Submit Now</span>
          </button>
        </div>
      </div>
    </div>
  )
}

function SectionHeader({
  accent,
  icon,
  label,
  pointsLabel,
  secondaryMetric,
  secondaryLabel,
  translation,
  valueLabel,
}) {
  return (
    <header className="section-header">
      <div className="section-title">
        <span className="section-icon" style={{ background: `${accent}14`, color: accent }}>
          {icon}
        </span>

        <div>
          <h2>{label}</h2>
          <p>{translation}</p>
        </div>
      </div>

      <div className="section-metrics">
        <article className="metric-card">
          <strong>{secondaryMetric}</strong>
          <span>{secondaryLabel}</span>
        </article>
        <article className="metric-card">
          <strong>{valueLabel}</strong>
          <span>{pointsLabel}</span>
        </article>
      </div>
    </header>
  )
}

function StrategyDrawer({ items, open, strategy, title, onToggle }) {
  return (
    <div className="strategy-drawer">
      <button className={`strategy-toggle ${open ? 'open' : ''}`} type="button" onClick={onToggle}>
        <div>
          <Lightbulb size={14} />
          <span>{title}</span>
        </div>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {open && (
        <div className="strategy-body">
          <p>{strategy}</p>
          <ul>
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function WritingTaskCard({ disabled, task, text, onTextChange }) {
  const [showTips, setShowTips] = useState(false)
  const wordCount = countWords(text)
  const inRange = wordCount >= task.minWords && wordCount <= task.maxWords
  const overLimit = wordCount > task.maxWords

  return (
    <article className="task-card">
      <div className="task-head">
        <div>
          <h3>{task.title}</h3>
          <p>{task.titleRu}</p>
        </div>
        <div className={`word-pill ${inRange ? 'good' : overLimit ? 'bad' : ''}`}>
          {task.minWords}-{task.maxWords} words
        </div>
      </div>

      <div className="task-prompt-box">
        <p>{task.prompt}</p>
      </div>

      <button className={`tips-toggle ${showTips ? 'open' : ''}`} type="button" onClick={() => setShowTips((current) => !current)}>
        <div>
          <Lightbulb size={14} />
          <span>Writing Tips</span>
        </div>
        {showTips ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {showTips && (
        <div className="tips-body">
          {task.supportPoints.map((item, index) => (
            <div key={item}>
              <strong>{index + 1}.</strong>
              <span>{item}</span>
            </div>
          ))}
        </div>
      )}

      <div className="textarea-wrap">
        <textarea
          className="task-textarea"
          disabled={disabled}
          placeholder={`Write your response here... (${task.minWords}-${task.maxWords} words)`}
          rows={8}
          value={text}
          onChange={(event) => onTextChange(task.id, event.target.value)}
        />
        <span className={`textarea-count ${inRange ? 'good' : overLimit ? 'bad' : ''}`}>
          {wordCount} / {task.maxWords}w
        </span>
      </div>

      {isFilled(text) && (
        <p className={`task-status-line ${inRange ? 'good' : overLimit ? 'bad' : ''}`}>
          {inRange
            ? 'Word count is within range.'
            : overLimit
              ? `${wordCount - task.maxWords} words over the limit.`
              : `${task.minWords - wordCount} more words needed.`}
        </p>
      )}
    </article>
  )
}

function QuestionCard({ disabled = false, index, question, value, onChange }) {
  const isAnswered = isFilled(value)

  return (
    <article className={`question-card ${isAnswered ? 'answered' : ''} ${disabled ? 'locked' : ''}`}>
      <div className="question-card-head">
        <div className="question-headline">
          <span className={`question-number ${isAnswered ? 'answered' : ''}`}>{index}</span>
          <p>{question.prompt}</p>
        </div>

        <div className="question-badges">
          {question.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
          <em>
            {question.points} pt{question.points > 1 ? 's' : ''}
          </em>
        </div>
      </div>

      <div className="question-body">
        {question.type === 'multipleChoice' && (
          <div className="option-grid">
            {question.options.map((option, optionIndex) => {
              const isSelected = value === option
              const letters = ['A', 'B', 'C', 'D']
              return (
                <button
                  key={option}
                  className={`option-button ${isSelected ? 'selected' : ''}`}
                  disabled={disabled}
                  type="button"
                  onClick={() => onChange(question.id, option)}
                >
                  <strong>{letters[optionIndex]}</strong>
                  <span>{option}</span>
                </button>
              )
            })}
          </div>
        )}

        {question.type === 'trueFalseNotGiven' && (
          <div className="option-grid compact">
            {[
              { label: 'True', value: 'true' },
              { label: 'False', value: 'false' },
              { label: 'Not Given', value: 'not given' },
            ].map((option) => (
              <button
                key={option.value}
                className={`option-button pill ${value === option.value ? 'selected' : ''}`}
                disabled={disabled}
                type="button"
                onClick={() => onChange(question.id, option.value)}
              >
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        )}

        {question.type === 'shortText' && (
          <input
            className="answer-input"
            disabled={disabled}
            placeholder="Type your answer here..."
            type="text"
            value={value || ''}
            onChange={(event) => onChange(question.id, event.target.value)}
          />
        )}
      </div>
    </article>
  )
}

function ListeningPlayer({ activeListeningId, audioState, disabled = false, playCount, section, onPlay }) {
  const isPlaying = activeListeningId === section.id && audioState.isPlaying
  const remainingTime = Math.max(0, (audioState.duration || 0) - (audioState.currentTime || 0))
  const progressPercent =
    audioState.duration > 0 ? Math.min(100, (audioState.currentTime / audioState.duration) * 100) : 0
  const canPlay = !disabled && !isPlaying && playCount < section.maxPlays

  return (
    <div className="audio-card">
      <div className="audio-card-head">
        <div>
          <span>Audio Track</span>
          <strong>{section.title}</strong>
        </div>

        <div className="audio-plays">
          <div>
            {Array.from({ length: section.maxPlays }).map((_, index) => (
              <i key={index} className={index < playCount ? 'used' : ''} />
            ))}
          </div>
          <span>
            {playCount}/{section.maxPlays} plays
          </span>
        </div>
      </div>

      <div className="audio-progress" aria-hidden="true">
        <div className="audio-progress-fill" style={{ width: `${progressPercent}%` }} />
      </div>

      <div className="audio-controls">
        <button className={`audio-play-button ${isPlaying ? 'active' : ''}`} disabled={!canPlay} type="button" onClick={onPlay}>
          {isPlaying ? <Square size={16} /> : <Play size={16} />}
          <span>
            {isPlaying
              ? 'Playing now'
              : playCount === 0
                ? 'Play track'
                : playCount < section.maxPlays
                  ? 'Replay track'
                  : 'Replay limit reached'}
          </span>
        </button>

        <span className="audio-timer">
          {formatDuration(audioState.currentTime)} / {audioState.duration ? formatDuration(audioState.duration) : '--:--'}
        </span>
      </div>

      <p className="audio-caption">
        {disabled
          ? 'Time is over. Listening is locked.'
          : `No pause. No speed change. ${formatDuration(remainingTime)} left in the current track once playback starts.`}
      </p>

      <div className="listen-for-row">
        <span>Listen for</span>
        <div>
          {section.listenFor.map((item) => (
            <i key={item}>{item}</i>
          ))}
        </div>
      </div>
    </div>
  )
}

function SectionFooter({ canGoBack, onBack, onContinue, continueLabel }) {
  return (
    <footer className="section-footer">
      {canGoBack ? (
        <button className="ghost-action" type="button" onClick={onBack}>
          <ChevronLeft size={16} />
          <span>Back</span>
        </button>
      ) : (
        <span />
      )}

      <button className="primary-cta slim" type="button" onClick={onContinue}>
        <span>{continueLabel}</span>
        <ChevronRight size={16} />
      </button>
    </footer>
  )
}

function RubricSlider({ criterion, value, onChange }) {
  return (
    <label className="rubric-row">
      <div>
        <strong>{criterion.label}</strong>
        <span>{criterion.labelRu}</span>
      </div>
      <input max="5" min="0" step="0.5" type="range" value={value} onChange={(event) => onChange(event.target.value)} />
      <em>{value}</em>
    </label>
  )
}

export default App
