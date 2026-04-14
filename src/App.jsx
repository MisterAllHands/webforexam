import { useEffect, useId, useRef, useState } from 'react'
import './App.css'
import { examData } from './examData'

const STORAGE_KEY = 'galina-exam-template-v1'
const EXAM_DURATION_SECONDS = 3 * 60 * 60
const EXAM_SECTIONS = ['overview', 'reading', 'listening', 'writing', 'speaking', 'results']
const SKILL_SECTION_MAP = {
  reading: examData.reading,
  listening: examData.listening,
  writing: examData.writing,
  speaking: examData.speaking,
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
    lastUpdatedAt: '',
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
            saved: true,
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
  const nextState = {
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

  return nextState
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

function getSectionVerdict(earned, possible) {
  const percent = possible === 0 ? 0 : Math.round((earned / possible) * 100)

  if (percent >= 85) {
    return 'Secure'
  }
  if (percent >= 70) {
    return 'Working well'
  }
  if (percent >= 55) {
    return 'Developing'
  }
  return 'Needs revision'
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

function createDownload(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function App() {
  const [examState, setExamState] = useState(() => loadSavedState())
  const [currentSection, setCurrentSection] = useState('overview')
  const [now, setNow] = useState(() => Date.now())
  const [playCounts, setPlayCounts] = useState({})
  const [audioState, setAudioState] = useState(() => createInitialAudioState())
  const [activeListeningId, setActiveListeningId] = useState('')
  const [listeningError, setListeningError] = useState('')
  const [recordingError, setRecordingError] = useState('')
  const [activeRecordingId, setActiveRecordingId] = useState('')
  const [teacherMode, setTeacherMode] = useState(false)
  const importInputId = useId()

  const audioRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const mediaChunksRef = useRef([])
  const mediaStreamRef = useRef(null)
  const recordingStartedAtRef = useRef(0)
  const hasStarted = isFilled(examState.startedAt)
  const startedAtMs = hasStarted ? Date.parse(examState.startedAt) : 0
  const deadlineMs = startedAtMs + EXAM_DURATION_SECONDS * 1000
  const remainingSeconds = hasStarted ? Math.max(0, Math.ceil((deadlineMs - now) / 1000)) : EXAM_DURATION_SECONDS
  const timerExpired = hasStarted && remainingSeconds <= 0
  const isExamLocked = isFilled(examState.lockedAt) || timerExpired
  const hasActiveAttempt = hasStarted && !isExamLocked
  const hasLockedAttempt = hasStarted && isExamLocked

  const { reading: readingQuestions, listening: listeningQuestions } = getAllObjectiveQuestions()
  const objectiveQuestions = [...readingQuestions, ...listeningQuestions]
  const readingScore = getObjectiveSectionScore(readingQuestions, examState.answers)
  const listeningScore = getObjectiveSectionScore(listeningQuestions, examState.answers)
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
  const objectiveTotalScore = readingScore.earned + listeningScore.earned
  const objectiveMaxScore = readingScore.possible + listeningScore.possible
  const reviewedTotalScore = objectiveTotalScore + writingTeacherScore + speakingTeacherScore
  const reviewedMaxScore = objectiveMaxScore + 20 + 20
  const totalScore = finalReviewReady ? reviewedTotalScore : objectiveTotalScore
  const maxScore = finalReviewReady ? reviewedMaxScore : objectiveMaxScore
  const totalPercent = maxScore === 0 ? 0 : Math.round((totalScore / maxScore) * 100)
  const completion = getCompletionStatus(examState)
  const completedSkills = Object.values(completion).filter(Boolean).length
  const progressPercent = Math.round((completedSkills / 4) * 100)
  const writingCompletedCount = examData.writing.tasks.filter((task) => isFilled(examState.writing[task.id])).length
  const speakingCompletedCount = examData.speaking.parts.filter(
    (part) => examState.speaking[part.id] && examState.speaking[part.id].recording,
  ).length
  const readinessLabel = isExamLocked && !finalReviewReady ? 'Time over' : finalReviewReady ? getReadinessLabel(totalScore, totalPercent) : 'Awaiting reviewer marks'
  const allSectionsFinished = Object.values(completion).every(Boolean)
  const topRevisionPriority = revisionPriorities[0]?.tag || 'No urgent priority detected'
  const topStrength = strongestAreas[0]?.tag || 'Balanced objective profile'
  const readingVerdict = getSectionVerdict(readingScore.earned, readingScore.possible)
  const listeningVerdict = getSectionVerdict(listeningScore.earned, listeningScore.possible)
  const studentSummary = allSectionsFinished
    ? finalReviewReady
      ? `${examData.meta.studentName} has completed the full private session. The current strongest objective area is ${topStrength.toLowerCase()}, while the clearest next focus is ${topRevisionPriority.toLowerCase()}.`
      : `${examData.meta.studentName} has completed the full private session. Reading and listening are locked in, and writing plus speaking are waiting for reviewer marks.`
    : isExamLocked
      ? `Time is over. ${examData.meta.studentName}'s current answers have been locked and should be sent to Ramazan.`
    : `${examData.meta.studentName}'s session is still in progress. Finish all four skills to lock the full readiness picture and certificate.`
  const visibleNavSections = ['reading', 'listening', 'writing', 'speaking', 'results']

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...getStorageSafeState(examState),
        lastUpdatedAt: new Date().toISOString(),
      }),
    )
  }, [examState])

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
      setCurrentSection('reading')
    }
  }, [currentSection, hasActiveAttempt])

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
    if (!timerExpired || examState.lockedAt) {
      return
    }

    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current.src = ''
      audioRef.current = null
    }

    if (activeListeningId) {
      setAudioState((current) => ({
        ...current,
        [activeListeningId]: {
          ...current[activeListeningId],
          currentTime: 0,
          isPlaying: false,
          hasFinished: false,
        },
      }))
    }

    setActiveListeningId('')

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }

    setExamState((current) => ({
      ...current,
      lockedAt: current.lockedAt || new Date().toISOString(),
    }))
    setCurrentSection('results')
  }, [activeListeningId, timerExpired, examState.lockedAt])

  const updateAnswer = (questionId, value) => {
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

  const updateWriting = (taskId, value) => {
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

  const updateTeacherScore = (group, criterionId, value) => {
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

  const updateTeacherComment = (field, value) => {
    setExamState((current) => ({
      ...current,
      teacherReview: {
        ...current.teacherReview,
        [field]: value,
        reviewedAt: new Date().toISOString(),
      },
    }))
  }

  const goToSection = (sectionId) => {
    if (!hasStarted && sectionId !== 'overview') {
      return
    }

    if (isExamLocked && sectionId !== 'results') {
      return
    }

    if (currentSection === 'listening' && sectionId !== 'listening') {
      stopListeningPlayback()
    }

    setCurrentSection(sectionId)
  }

  const startExam = () => {
    if (isExamLocked) {
      window.localStorage.removeItem(STORAGE_KEY)
    }

    const startedAt = new Date().toISOString()
    setNow(Date.now())
    setExamState({
      ...createInitialState(),
      startedAt,
      lockedAt: '',
    })
    setPlayCounts({})
    setAudioState(createInitialAudioState())
    setListeningError('')
    setRecordingError('')
    setTeacherMode(false)
    setCurrentSection('reading')
  }

  const stopListeningPlayback = () => {
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

  const playListeningSection = (section) => {
    if (isExamLocked) {
      setListeningError('Time is over. The exam is locked.')
      return
    }

    if ((playCounts[section.id] || 0) >= section.maxPlays) {
      setListeningError('Maximum playback count reached for this audio.')
      return
    }

    setListeningError('')
    stopListeningPlayback()

    setPlayCounts((current) => ({
      ...current,
      [section.id]: (current[section.id] || 0) + 1,
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

  const startRecording = async (partId) => {
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
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve(reader.result)
          reader.onerror = reject
          reader.readAsDataURL(blob)
        })

        const durationSeconds = Math.max(1, Math.round((Date.now() - recordingStartedAtRef.current) / 1000))

        setExamState((current) => ({
          ...current,
          speaking: {
            ...current.speaking,
            [partId]: {
              recording: {
                dataUrl,
                mimeType: blob.type || 'audio/webm',
                name: `${partId}.webm`,
                durationLabel: `${durationSeconds} sec`,
              },
            },
          },
        }))

        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((track) => track.stop())
        }

        setActiveRecordingId('')
      }

      recorder.start()
      setRecordingError('')
      setActiveRecordingId(partId)
    } catch {
      setRecordingError('Microphone access was blocked. Please allow microphone permissions and try again.')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
  }

  const deleteRecording = (partId) => {
    if (isExamLocked) {
      return
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
  }

  const exportSubmission = () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      meta: examData.meta,
      state: examState,
      timing: {
        durationSeconds: EXAM_DURATION_SECONDS,
        startedAt: examState.startedAt,
        lockedAt: examState.lockedAt,
        exportedAfterLock: isExamLocked,
        remainingSeconds,
      },
      results: {
        readingScore,
        listeningScore,
        objectiveTotalScore,
        objectiveMaxScore,
        writingReviewed,
        speakingReviewed,
        finalReviewReady,
        writingTeacherScore,
        speakingTeacherScore,
        totalScore,
        maxScore,
        totalPercent,
        readinessLabel,
      },
    }

    createDownload(
      `galina-exam-submission-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(payload, null, 2),
      'application/json',
    )
  }

  const importSubmission = async (event) => {
    const file = event.target.files && event.target.files[0]
    if (!file) {
      return
    }

    try {
      const raw = await file.text()
      const parsed = JSON.parse(raw)
      const nextState = mergeImportedState(parsed.state || parsed)
      setExamState(nextState)
      setTeacherMode(true)
      goToSection('results')
    } catch {
      setRecordingError('The submission file could not be imported.')
    } finally {
      event.target.value = ''
    }
  }

  const printCertificate = () => {
    window.print()
  }

  const nextSection = () => {
    const currentIndex = EXAM_SECTIONS.indexOf(currentSection)
    const next = EXAM_SECTIONS[currentIndex + 1]
    if (next) {
      goToSection(next)
    }
  }

  const previousSection = () => {
    const currentIndex = EXAM_SECTIONS.indexOf(currentSection)
    const previous = EXAM_SECTIONS[currentIndex - 1]
    if (previous) {
      goToSection(previous)
    }
  }

  return (
    <div className={`app-shell section-${currentSection}`}>
      {currentSection === 'overview' && (
        <header className="hero-panel">
          <div className="hero-copy hero-copy-full">
            <p className="eyebrow">Private English session designed only for Galina</p>
            <h1>{examData.meta.examTitle}</h1>
            <p className="hero-text">{examData.meta.subtitle}</p>
            <p className="hero-support">
              {examData.overview.intro}
              <span>{examData.overview.introRu}</span>
            </p>
            <div className="hero-mini-strip">
              <span>{examData.meta.estimatedMinutes} min</span>
              <span>4 skills</span>
              <span>Headphones + mic</span>
            </div>
          </div>
        </header>
      )}

      {hasActiveAttempt && (
        <section className={`surface nav-panel ${isExamLocked ? 'is-locked' : ''}`}>
          <div className="progress-copy">
            <p className="mini-label">Galina's exam</p>
            <strong>{progressPercent}% complete</strong>
            <span>{completedSkills} of 4 sections done</span>
            <div className="progress-track" aria-hidden="true">
              <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>

          <div className={`timer-pill ${remainingSeconds <= 600 && !isExamLocked ? 'urgent' : ''} ${isExamLocked ? 'locked' : ''}`}>
            <span>{isExamLocked ? 'Time over' : 'Time left'}</span>
            <strong>{isExamLocked ? 'Locked' : formatCountdown(remainingSeconds)}</strong>
          </div>

          <nav className="section-nav" aria-label="Exam sections">
            {visibleNavSections.map((sectionId) => {
              const navLabels = {
                reading: 'Read',
                listening: 'Listen',
                writing: 'Write',
                speaking: 'Speak',
                results: 'Finish',
              }
              const label = navLabels[sectionId]
              const isActive = currentSection === sectionId
              const isSkill = ['reading', 'listening', 'writing', 'speaking'].includes(sectionId)
              const isComplete = isSkill ? completion[sectionId] : false

              return (
                <button
                  key={sectionId}
                  className={`nav-chip ${isActive ? 'active' : ''} ${isComplete ? 'complete' : ''}`}
                  onClick={() => goToSection(sectionId)}
                  type="button"
                >
                  {label}
                </button>
              )
            })}
          </nav>
        </section>
      )}

      {currentSection === 'overview' && (
        <section className="surface section-panel">
          <div className="section-heading">
            <div>
              <p className="mini-label">Session brief</p>
              <h2>Start the exam</h2>
            </div>
            <div className="score-pill">
              <span>Private session</span>
              <strong>{examData.meta.studentName}</strong>
            </div>
          </div>

          <div className="overview-grid">
            <article className="content-card overview-lead">
              <h3>Ready when you are</h3>
              <p className="task-prompt">
                Find a quiet place, use headphones, and finish the full session in one sitting.
              </p>
              <p className="support-note">{examData.overview.missionRu}</p>
              {hasLockedAttempt && (
                <p className="support-note">
                  A previous attempt on this device has ended. Press Start to begin a new exam.
                </p>
              )}

              <div className="quick-facts">
                <span>3-hour timer</span>
                <span>One sitting only</span>
                <span>Timer starts after this button</span>
              </div>

              <div className="action-row">
                <button className="primary-button" type="button" onClick={startExam}>
                  Start the exam
                </button>
              </div>

              <div className="meta-line">
                <span>Started: {formatTimestamp(examState.startedAt)}</span>
                <span>Progress saves automatically in this browser</span>
              </div>
            </article>

            <article className="content-card overview-card">
              <h3>Before you start</h3>
              <ul className="plain-list">
                {examData.overview.rules.slice(0, 4).map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </article>
          </div>
        </section>
      )}

      {currentSection === 'reading' && (
        <section className="surface section-panel">
          <div className="section-heading">
            <div>
              <p className="mini-label">Section 1</p>
              <h2>{examData.reading.sectionTitle}</h2>
            </div>
            <div className="score-pill">
              <span>Questions answered</span>
              <strong>
                {readingScore.answered}/{readingScore.totalQuestions}
              </strong>
            </div>
          </div>
          <SectionPrelude config={SKILL_SECTION_MAP.reading} />
          <p className="instruction-text">{examData.reading.instruction}</p>

          {examData.reading.passages.map((passage) => (
            <article key={passage.id} className="exam-card">
              <div className="card-header">
                <h3>{passage.title}</h3>
                <span>{passage.questions.length} questions</span>
              </div>

              <div className="passage-box">
                {passage.text.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>

              <div className="question-grid">
                {passage.questions.map((question, index) => (
                  <QuestionCard
                    key={question.id}
                    disabled={isExamLocked}
                    index={index + 1}
                    question={question}
                    value={examState.answers[question.id]}
                    onChange={updateAnswer}
                  />
                ))}
              </div>
            </article>
          ))}

          <div className="action-row">
            <button className="primary-button" type="button" onClick={nextSection}>
              Continue to listening
            </button>
          </div>
        </section>
      )}

      {currentSection === 'listening' && (
        <section className="surface section-panel">
          <div className="section-heading">
            <div>
              <p className="mini-label">Section 2</p>
              <h2>{examData.listening.sectionTitle}</h2>
            </div>
            <div className="score-pill">
              <span>Questions answered</span>
              <strong>
                {listeningScore.answered}/{listeningScore.totalQuestions}
              </strong>
            </div>
          </div>
          <SectionPrelude config={SKILL_SECTION_MAP.listening} />

          <p className="instruction-text">{examData.listening.instruction}</p>
          <p className="support-note">{examData.listening.playerNote}</p>

          {listeningError && <p className="error-text">{listeningError}</p>}

          {examData.listening.sections.map((section, sectionIndex) => (
            <article key={section.id} className="exam-card">
              <div className="card-header">
                <h3>{section.title}</h3>
                <span>Plays left: {section.maxPlays - (playCounts[section.id] || 0)}</span>
              </div>

              <p className="hint-line">Listen for: {section.listenFor.join(' • ')}</p>

              <ListeningPlayer
                activeListeningId={activeListeningId}
                audioState={audioState[section.id]}
                disabled={isExamLocked}
                onPlay={() => playListeningSection(section)}
                playCount={playCounts[section.id] || 0}
                section={section}
                sectionIndex={sectionIndex}
              />

              <div className="question-grid">
                {section.questions.map((question, index) => (
                  <QuestionCard
                    key={question.id}
                    disabled={isExamLocked}
                    index={index + 1}
                    question={question}
                    value={examState.answers[question.id]}
                    onChange={updateAnswer}
                  />
                ))}
              </div>
            </article>
          ))}

          <div className="action-row">
            <button className="primary-button" type="button" onClick={nextSection}>
              Continue to writing
            </button>
            <button className="ghost-button" type="button" onClick={previousSection}>
              Back to reading
            </button>
          </div>
        </section>
      )}

      {currentSection === 'writing' && (
        <section className="surface section-panel">
          <div className="section-heading">
            <div>
              <p className="mini-label">Section 3</p>
              <h2>{examData.writing.sectionTitle}</h2>
            </div>
            <div className="score-pill">
              <span>Tasks drafted</span>
              <strong>{writingCompletedCount}/{examData.writing.tasks.length}</strong>
            </div>
          </div>
          <SectionPrelude config={SKILL_SECTION_MAP.writing} />

          <p className="instruction-text">{examData.writing.instruction}</p>

          {examData.writing.tasks.map((task) => {
            const value = examState.writing[task.id]
            const words = countWords(value)

            return (
              <article key={task.id} className="exam-card">
                <div className="card-header">
                  <h3>
                    {task.title} / {task.titleRu}
                  </h3>
                  <span>
                    {words} words | target {task.minWords}-{task.maxWords}
                  </span>
                </div>

                <p className="task-prompt">{task.prompt}</p>
                <p className="hint-line">Include: {task.supportPoints.join(' • ')}</p>
                <textarea
                  className="essay-field"
                  disabled={isExamLocked}
                  value={value}
                  onChange={(event) => updateWriting(task.id, event.target.value)}
                  placeholder="Write your answer here..."
                  rows={8}
                />
              </article>
            )
          })}

          <div className="action-row">
            <button className="primary-button" type="button" onClick={nextSection}>
              Continue to speaking
            </button>
            <button className="ghost-button" type="button" onClick={previousSection}>
              Back to listening
            </button>
          </div>
        </section>
      )}

      {currentSection === 'speaking' && (
        <section className="surface section-panel">
          <div className="section-heading">
            <div>
              <p className="mini-label">Section 4</p>
              <h2>{examData.speaking.sectionTitle}</h2>
            </div>
            <div className="score-pill">
              <span>Recordings saved</span>
              <strong>{speakingCompletedCount}/{examData.speaking.parts.length}</strong>
            </div>
          </div>
          <SectionPrelude config={SKILL_SECTION_MAP.speaking} />

          <p className="instruction-text">{examData.speaking.instruction}</p>
          <p className="support-note">{examData.speaking.browserNote}</p>
          {recordingError && <p className="error-text">{recordingError}</p>}

          {examData.speaking.parts.map((part) => {
            const recording = examState.speaking[part.id].recording

            return (
              <article key={part.id} className="exam-card">
                <div className="card-header">
                  <h3>{part.title}</h3>
                  <span>{part.duration}</span>
                </div>

                <p className="task-prompt">{part.prompt}</p>
                <p className="hint-line">Cover: {part.followUps.join(' • ')}</p>

                <div className="recording-bar">
                  {activeRecordingId === part.id ? (
                    <button className="primary-button is-recording" type="button" onClick={stopRecording}>
                      Stop recording
                    </button>
                  ) : (
                    <button className="primary-button" type="button" disabled={isExamLocked} onClick={() => startRecording(part.id)}>
                      {recording ? 'Record again' : 'Start recording'}
                    </button>
                  )}

                  {recording && (
                    <>
                      <span className="recording-tag">{recording.durationLabel}</span>
                      <button className="ghost-button" type="button" disabled={isExamLocked} onClick={() => deleteRecording(part.id)}>
                        Delete
                      </button>
                    </>
                  )}
                </div>

                {recording && (
                  <audio className="audio-player" controls src={recording.dataUrl}>
                    Your browser does not support audio playback.
                  </audio>
                )}
              </article>
            )
          })}

          <div className="action-row">
            <button className="primary-button" type="button" onClick={nextSection}>
              Go to results
            </button>
            <button className="ghost-button" type="button" onClick={previousSection}>
              Back to writing
            </button>
          </div>
        </section>
      )}

      {currentSection === 'results' && (
        <section className="surface section-panel">
          {isExamLocked && (
            <div className="lock-banner">
              <span>Time is over</span>
              <strong>The exam is locked.</strong>
              <p>No more answers can be changed. Download the submission file and send it to Ramazan.</p>
            </div>
          )}

          <div className="section-heading">
            <div>
              <p className="mini-label">Results</p>
              <h2>Assessment summary and certificate</h2>
            </div>
            <div className="score-pill large">
              <span>Overall readiness</span>
              <strong>{readinessLabel}</strong>
            </div>
          </div>

          <div className="results-editorial">
            <article className="content-card">
              <h3>Session complete</h3>
              <p>{studentSummary}</p>
              <p className="support-note">Private readiness summary only. This is not an official IELTS result.</p>
            </article>
          </div>

          <div className="results-grid">
            <article className="result-card">
              <span>Reading accuracy</span>
              <strong>
                {readingScore.earned}/{readingScore.possible}
              </strong>
              <p>{readingVerdict}</p>
            </article>

            <article className="result-card">
              <span>Listening focus</span>
              <strong>
                {listeningScore.earned}/{listeningScore.possible}
              </strong>
              <p>{listeningVerdict}</p>
            </article>

            <article className={`result-card ${writingReviewed ? '' : 'pending'}`.trim()}>
              <span>Writing review</span>
              <strong>{writingReviewed ? `${writingTeacherScore}/20` : 'Pending review'}</strong>
              <p>{writingReviewed ? 'Reviewer marks saved' : 'Reviewer-scored after submission'}</p>
            </article>

            <article className={`result-card ${speakingReviewed ? '' : 'pending'}`.trim()}>
              <span>Speaking review</span>
              <strong>{speakingReviewed ? `${speakingTeacherScore}/20` : 'Pending review'}</strong>
              <p>{speakingReviewed ? 'Reviewer marks saved' : 'Reviewer-scored after submission'}</p>
            </article>
          </div>

          <div className={`completion-banner ${finalReviewReady ? '' : 'pending'}`.trim()}>
            <div>
              <span>{finalReviewReady ? 'Total score' : 'Current scored sections'}</span>
              <strong>
                {totalScore}/{maxScore}
              </strong>
            </div>
            <div>
              <span>{finalReviewReady ? 'Percent' : 'Current percent'}</span>
              <strong>{totalPercent}%</strong>
            </div>
            <div>
              <span>{finalReviewReady ? 'Pass line' : 'Final review'}</span>
              <strong>{finalReviewReady ? `${examData.meta.passPercentage}%` : 'Writing + speaking pending'}</strong>
            </div>
          </div>

          <details className="results-details">
            <summary>Show revision details</summary>
            <div className="teacher-panel diagnostics-panel">
              <div className="teacher-column">
                <h3>Next revision focus</h3>
                <div className="diagnostic-list">
                  {revisionPriorities.length > 0 ? (
                    revisionPriorities.map((item) => (
                      <article key={item.tag} className="diagnostic-card priority">
                        <div>
                          <span>{item.tag}</span>
                          <strong>{item.percent}%</strong>
                        </div>
                        <p>
                          {item.earned}/{item.possible} points across {item.totalQuestions} tasks
                        </p>
                      </article>
                    ))
                  ) : (
                    <p className="support-note">No low-scoring grammar area has been detected in the auto-scored sections.</p>
                  )}
                </div>
              </div>

              <div className="teacher-column">
                <h3>Most confident areas</h3>
                <div className="diagnostic-list">
                  {strongestAreas.map((item) => (
                    <article key={item.tag} className="diagnostic-card">
                      <div>
                        <span>{item.tag}</span>
                        <strong>{item.percent}%</strong>
                      </div>
                      <p>
                        {item.earned}/{item.possible} points across {item.totalQuestions} tasks
                      </p>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </details>

          <div className="action-row">
            <button className="primary-button" type="button" onClick={exportSubmission}>
              Download submission file
            </button>
            {!isExamLocked && (
              <button className="ghost-button" type="button" onClick={previousSection}>
                Back to speaking
              </button>
            )}
          </div>

          <details className="results-details reviewer-details">
            <summary>Teacher tools</summary>
            <div className="action-row reviewer-actions">
              <button className="ghost-button" type="button" onClick={printCertificate}>
                Print certificate
              </button>
              <button className="ghost-button" type="button" onClick={() => setTeacherMode((current) => !current)}>
                {teacherMode ? 'Hide reviewer tools' : 'Open reviewer tools'}
              </button>
            </div>
          </details>

          {teacherMode && (
            <div className="action-row reviewer-actions">
              <label className="ghost-button file-trigger" htmlFor={importInputId}>
                Import reviewer file
              </label>
              <input
                id={importInputId}
                className="hidden-input"
                type="file"
                accept="application/json"
                onChange={importSubmission}
              />
            </div>
          )}

          {teacherMode && (
            <div className="teacher-panel">
              <div className="teacher-column">
                <h3>Writing review</h3>
                {examData.writing.rubric.map((criterion) => (
                  <RubricSlider
                    key={criterion.id}
                    criterion={criterion}
                    value={examState.teacherReview.writingScores[criterion.id]}
                    onChange={(value) => updateTeacherScore('writing', criterion.id, value)}
                  />
                ))}
                <textarea
                  className="teacher-textarea"
                  rows={4}
                  value={examState.teacherReview.writingComment}
                  onChange={(event) => updateTeacherComment('writingComment', event.target.value)}
                  placeholder="Writing feedback for Galina..."
                />
              </div>

              <div className="teacher-column">
                <h3>Speaking review</h3>
                {examData.speaking.rubric.map((criterion) => (
                  <RubricSlider
                    key={criterion.id}
                    criterion={criterion}
                    value={examState.teacherReview.speakingScores[criterion.id]}
                    onChange={(value) => updateTeacherScore('speaking', criterion.id, value)}
                  />
                ))}
                <textarea
                  className="teacher-textarea"
                  rows={4}
                  value={examState.teacherReview.speakingComment}
                  onChange={(event) => updateTeacherComment('speakingComment', event.target.value)}
                  placeholder="Speaking feedback for Galina..."
                />
              </div>
            </div>
          )}

          {teacherMode && (
            <div className="teacher-summary">
              <h3>Reviewer summary</h3>
              <textarea
                className="teacher-textarea"
                rows={4}
                value={examState.teacherReview.overallComment}
                onChange={(event) => updateTeacherComment('overallComment', event.target.value)}
                placeholder="Overall next steps, strengths, and revision focus..."
              />
              <p className="meta-line">Reviewed: {formatTimestamp(examState.teacherReview.reviewedAt)}</p>
            </div>
          )}

          <section className="certificate-card print-area">
            <p className="certificate-overline">{examData.meta.certificateTitle}</p>
            <h3>{examData.meta.studentName}</h3>
            <p className="certificate-subtitle">{examData.meta.certificateSubtitle}</p>
            <div className="certificate-metrics">
              <div>
                <span>Completion</span>
                <strong>{Object.values(completion).every(Boolean) ? 'All sections finished' : 'In progress'}</strong>
              </div>
              <div>
                <span>Readiness</span>
                <strong>{readinessLabel}</strong>
              </div>
              <div>
                <span>Final score</span>
                <strong>{finalReviewReady ? `${totalScore}/${maxScore}` : 'Pending reviewer marks'}</strong>
              </div>
            </div>
            <p className="certificate-footer">{examData.meta.certificateFooter}</p>
            <div className="signature-row">
              <div>
                <span>Teacher</span>
                <strong>{examData.meta.teacherName}</strong>
              </div>
              <div>
                <span>Date</span>
                <strong>{formatTimestamp(examState.teacherReview.reviewedAt || examState.startedAt)}</strong>
              </div>
            </div>
          </section>
        </section>
      )}
    </div>
  )
}

function QuestionCard({ disabled = false, index, question, value, onChange }) {
  return (
    <div className={`question-card ${isFilled(value) ? 'answered' : ''} ${disabled ? 'locked' : ''}`} style={{ '--card-delay': `${(index - 1) * 55}ms` }}>
      <div className="question-meta">
        <span>
          Q{index} · {question.points} pts
        </span>
      </div>
      <p className="question-prompt">{question.prompt}</p>

      {question.type === 'multipleChoice' && (
        <div className="option-list">
          {question.options.map((option) => (
            <label key={option} className={`option-chip ${value === option ? 'selected' : ''}`}>
              <input
                checked={value === option}
                disabled={disabled}
                name={question.id}
                onChange={() => onChange(question.id, option)}
                type="radio"
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      )}

      {question.type === 'trueFalseNotGiven' && (
        <div className="option-list compact">
          {['True', 'False', 'Not Given'].map((option) => (
            <label key={option} className={`option-chip ${value === option ? 'selected' : ''}`}>
              <input
                checked={value === option}
                disabled={disabled}
                name={question.id}
                onChange={() => onChange(question.id, option)}
                type="radio"
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      )}

      {question.type === 'shortText' && (
        <input
          className="short-answer"
          disabled={disabled}
          onChange={(event) => onChange(question.id, event.target.value)}
          placeholder="Write a short answer..."
          type="text"
          value={value}
        />
      )}
    </div>
  )
}

function ListeningPlayer({ activeListeningId, audioState, disabled = false, onPlay, playCount, section, sectionIndex }) {
  const isPlaying = activeListeningId === section.id && audioState.isPlaying
  const remainingTime = Math.max(0, (audioState.duration || 0) - (audioState.currentTime || 0))
  const progressPercent =
    audioState.duration > 0 ? Math.min(100, (audioState.currentTime / audioState.duration) * 100) : 0
  const isDisabled = disabled || isPlaying || playCount >= section.maxPlays

  let buttonLabel = `Play track ${sectionIndex + 1}`

  if (isPlaying) {
    buttonLabel = 'Playing now'
  } else if (disabled) {
    buttonLabel = 'Exam locked'
  } else if (playCount > 0 && playCount < section.maxPlays) {
    buttonLabel = `Replay track ${sectionIndex + 1}`
  } else if (playCount >= section.maxPlays) {
    buttonLabel = 'Replay limit reached'
  }

  return (
    <div className="listening-player">
      <div className="player-topline">
        <div>
          <span className="player-label">Track status</span>
          <strong>{isPlaying ? 'In progress' : audioState.hasFinished ? 'Completed' : 'Ready'}</strong>
        </div>
        <div className="player-meta">
          <span>
            Plays: {playCount}/{section.maxPlays}
          </span>
          <span>Time left: {formatDuration(remainingTime)}</span>
        </div>
      </div>

      <div className="player-progress" aria-hidden="true">
        <div className="player-progress-fill" style={{ width: `${progressPercent}%` }} />
      </div>

      <div className="listening-controls">
        <button className={`primary-button ${isPlaying ? 'is-active' : ''}`} type="button" disabled={isDisabled} onClick={onPlay}>
          {buttonLabel}
        </button>
        <p className="player-caption">
          {disabled ? 'Time is over. Listening is locked.' : 'No pause. No speed change. Start only when ready.'}
        </p>
      </div>
    </div>
  )
}

function SectionPrelude({ config }) {
  return (
    <details className="section-prelude">
      <summary>Section tips</summary>
      <div className="section-prelude-body">
        <article className="prelude-card main">
          <span className="mini-label">How to approach this section</span>
          <h3>{config.coachNote}</h3>
          <p>{config.strategy}</p>
        </article>

        <article className="prelude-card prelude-side">
          <span className="mini-label">Keep in mind</span>
          <ul className="plain-list">
            {config.checklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <div className="support-strip compact">
            {config.targetSkills.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </article>
      </div>
    </details>
  )
}

function RubricSlider({ criterion, value, onChange }) {
  return (
    <label className="rubric-row">
      <div>
        <span>{criterion.label}</span>
        <small>{criterion.labelRu}</small>
      </div>
      <input max="5" min="0" onChange={(event) => onChange(event.target.value)} step="0.5" type="range" value={value} />
      <strong>{value}</strong>
    </label>
  )
}

export default App
