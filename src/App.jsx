import { useEffect, useId, useRef, useState } from 'react'
import './App.css'
import { examData } from './examData'

const STORAGE_KEY = 'galina-exam-template-v1'
const EXAM_SECTIONS = ['overview', 'reading', 'listening', 'writing', 'speaking', 'results']
const SKILL_SECTION_MAP = {
  reading: examData.reading,
  listening: examData.listening,
  writing: examData.writing,
  speaking: examData.speaking,
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
  const [voiceOptions, setVoiceOptions] = useState([])
  const [selectedVoiceUri, setSelectedVoiceUri] = useState('')
  const [playCounts, setPlayCounts] = useState({})
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

  const { reading: readingQuestions, listening: listeningQuestions } = getAllObjectiveQuestions()
  const objectiveQuestions = [...readingQuestions, ...listeningQuestions]
  const readingScore = getObjectiveSectionScore(readingQuestions, examState.answers)
  const listeningScore = getObjectiveSectionScore(listeningQuestions, examState.answers)
  const focusAreaBreakdown = getFocusAreaBreakdown(objectiveQuestions, examState.answers)
  const revisionPriorities = focusAreaBreakdown.filter((item) => item.percent < examData.meta.passPercentage).slice(0, 4)
  const strongestAreas = [...focusAreaBreakdown].reverse().slice(0, 3)
  const writingTeacherScore = getTeacherScore(examState.teacherReview.writingScores)
  const speakingTeacherScore = getTeacherScore(examState.teacherReview.speakingScores)
  const totalScore = readingScore.earned + listeningScore.earned + writingTeacherScore + speakingTeacherScore
  const maxScore = readingScore.possible + listeningScore.possible + 20 + 20
  const totalPercent = Math.round((totalScore / maxScore) * 100)
  const completion = getCompletionStatus(examState)
  const completedSkills = Object.values(completion).filter(Boolean).length
  const progressPercent = Math.round((completedSkills / 4) * 100)
  const readinessLabel = getReadinessLabel(totalScore, totalPercent)
  const allSectionsFinished = Object.values(completion).every(Boolean)
  const topRevisionPriority = revisionPriorities[0]?.tag || 'No urgent priority detected'
  const topStrength = strongestAreas[0]?.tag || 'Balanced objective profile'

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
    const loadVoices = () => {
      const voices = window.speechSynthesis
        ? window.speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith('en'))
        : []

      setVoiceOptions(voices)

      if (!selectedVoiceUri && voices.length > 0) {
        setSelectedVoiceUri(voices[0].voiceURI)
      }
    }

    loadVoices()

    if (window.speechSynthesis) {
      window.speechSynthesis.addEventListener('voiceschanged', loadVoices)
    }

    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel()
        window.speechSynthesis.removeEventListener('voiceschanged', loadVoices)
      }
      if (audioRef.current) {
        audioRef.current.pause()
      }
    }
  }, [selectedVoiceUri])

  const updateAnswer = (questionId, value) => {
    setExamState((current) => ({
      ...current,
      answers: {
        ...current.answers,
        [questionId]: value,
      },
    }))
  }

  const updateWriting = (taskId, value) => {
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

  const startExam = () => {
    setExamState((current) => ({
      ...current,
      startedAt: current.startedAt || new Date().toISOString(),
    }))
    setCurrentSection('reading')
  }

  const stopListeningPlayback = () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    setActiveListeningId('')
  }

  const playListeningSection = (section) => {
    if (!window.speechSynthesis && !section.audioSrc) {
      setListeningError('This browser does not support speech playback.')
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

    if (section.audioSrc) {
      const audio = new Audio(section.audioSrc)
      audioRef.current = audio
      audio.onended = () => setActiveListeningId('')
      audio.onerror = () => {
        setListeningError('The audio file could not be loaded.')
        setActiveListeningId('')
      }
      audio.play().catch(() => {
        setListeningError('Playback was blocked by the browser.')
        setActiveListeningId('')
      })
      return
    }

    const utterance = new SpeechSynthesisUtterance(section.ttsText)
    const selectedVoice = voiceOptions.find((voice) => voice.voiceURI === selectedVoiceUri)

    if (selectedVoice) {
      utterance.voice = selectedVoice
    }

    utterance.rate = 0.95
    utterance.pitch = 1
    utterance.onend = () => setActiveListeningId('')
    utterance.onerror = () => {
      setListeningError('The browser could not play this TTS segment.')
      setActiveListeningId('')
    }

    window.speechSynthesis.speak(utterance)
  }

  const startRecording = async (partId) => {
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
      results: {
        readingScore,
        listeningScore,
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
      setCurrentSection('results')
    } catch {
      setRecordingError('The submission file could not be imported.')
    } finally {
      event.target.value = ''
    }
  }

  const resetExam = () => {
    stopListeningPlayback()
    if (activeRecordingId) {
      stopRecording()
    }
    window.localStorage.removeItem(STORAGE_KEY)
    setExamState(createInitialState())
    setPlayCounts({})
    setCurrentSection('overview')
    setTeacherMode(false)
  }

  const printCertificate = () => {
    window.print()
  }

  const nextSection = () => {
    const currentIndex = EXAM_SECTIONS.indexOf(currentSection)
    const next = EXAM_SECTIONS[currentIndex + 1]
    if (next) {
      setCurrentSection(next)
    }
  }

  return (
    <div className={`app-shell section-${currentSection}`}>
      <header className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Private English session designed only for Galina</p>
          <h1>{examData.meta.examTitle}</h1>
          <p className="hero-text">{examData.meta.subtitle}</p>
          <p className="hero-support">
            {examData.overview.intro}
            <span>{examData.overview.introRu}</span>
          </p>
          <div className="hero-mini-strip">
            <span>{examData.overview.mission}</span>
            <span>{examData.overview.missionRu}</span>
          </div>
        </div>

        <div className="hero-card">
          <div className="stat-block">
            <span className="stat-label">Student</span>
            <strong>{examData.meta.studentName}</strong>
          </div>
          <div className="stat-block">
            <span className="stat-label">Teacher</span>
            <strong>{examData.meta.teacherName}</strong>
          </div>
          <div className="stat-block">
            <span className="stat-label">Scope</span>
            <strong>{examData.meta.focusUnits}</strong>
          </div>
          <div className="stat-block">
            <span className="stat-label">Focus areas</span>
            <strong>{examData.meta.focusAreas.join(' • ')}</strong>
          </div>
        </div>
      </header>

      <section className="surface summary-grid">
        {examData.overview.sections.map((section, index) => (
          <article key={section.id} className="summary-card" style={{ '--card-delay': `${index * 70}ms` }}>
            <p className="mini-label">
              {section.title} / {section.titleRu}
            </p>
            <h2>{section.duration}</h2>
            <p>{section.description}</p>
            <span>{section.points} points</span>
          </article>
        ))}
      </section>

      <section className="surface nav-panel">
        <div className="progress-copy">
          <p className="mini-label">Progress</p>
          <strong>{progressPercent}% complete</strong>
          <span>
            {completedSkills} of 4 assessed skills completed
          </span>
          <div className="progress-track" aria-hidden="true">
            <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
        <nav className="section-nav" aria-label="Exam sections">
          {EXAM_SECTIONS.map((sectionId) => {
            const label = sectionId === 'overview' ? 'Overview' : sectionId[0].toUpperCase() + sectionId.slice(1)
            const isActive = currentSection === sectionId
            const isSkill = ['reading', 'listening', 'writing', 'speaking'].includes(sectionId)
            const isComplete = isSkill ? completion[sectionId] : false

            return (
              <button
                key={sectionId}
                className={`nav-chip ${isActive ? 'active' : ''} ${isComplete ? 'complete' : ''}`}
                onClick={() => setCurrentSection(sectionId)}
                type="button"
              >
                {label}
              </button>
            )
          })}
        </nav>
      </section>

      {currentSection === 'overview' && (
        <section className="surface section-panel">
          <div className="section-heading">
            <div>
              <p className="mini-label">Session brief</p>
              <h2>Before Galina begins</h2>
            </div>
            <div className="score-pill">
              <span>Estimated time</span>
              <strong>{examData.meta.estimatedMinutes} minutes</strong>
            </div>
          </div>

          <div className="two-column">
            <div className="content-card">
              <h3>Exam rules</h3>
              <ul className="plain-list">
                {examData.overview.rules.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </div>

            <div className="content-card">
              <h3>Pre-flight check</h3>
              <ul className="plain-list">
                {examData.overview.preflightChecklist.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="focus-strip">
            {examData.meta.focusAreas.map((area) => (
              <span key={area}>{area}</span>
            ))}
          </div>

          <div className="signature-grid">
            {examData.overview.signatureMoments.map((item, index) => (
              <article key={item} className="signature-card" style={{ '--card-delay': `${index * 80}ms` }}>
                <span>Exam tone</span>
                <p>{item}</p>
              </article>
            ))}
          </div>

          <div className="action-row">
            <button className="primary-button" type="button" onClick={startExam}>
              {examState.startedAt ? 'Continue exam' : 'Start exam'}
            </button>
            <button className="ghost-button" type="button" onClick={resetExam}>
              Reset session
            </button>
          </div>

          <div className="meta-line">
            <span>Started: {formatTimestamp(examState.startedAt)}</span>
            <span>Progress saves automatically in this browser</span>
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
              <span>Auto-scored</span>
              <strong>
                {readingScore.earned}/{readingScore.possible}
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
              <span>Auto-scored</span>
              <strong>
                {listeningScore.earned}/{listeningScore.possible}
              </strong>
            </div>
          </div>
          <SectionPrelude config={SKILL_SECTION_MAP.listening} />

          <p className="instruction-text">{examData.listening.instruction}</p>
          <p className="support-note">{examData.listening.ttsNote}</p>

          <div className="voice-bar">
            <label>
              <span>English voice</span>
              <select
                value={selectedVoiceUri}
                onChange={(event) => setSelectedVoiceUri(event.target.value)}
                disabled={voiceOptions.length === 0}
              >
                {voiceOptions.length === 0 && <option>No voices found</option>}
                {voiceOptions.map((voice) => (
                  <option key={voice.voiceURI} value={voice.voiceURI}>
                    {voice.name} ({voice.lang})
                  </option>
                ))}
              </select>
            </label>
            {activeListeningId && (
              <button className="ghost-button" type="button" onClick={stopListeningPlayback}>
                Stop audio
              </button>
            )}
          </div>

          {listeningError && <p className="error-text">{listeningError}</p>}

          {examData.listening.sections.map((section, sectionIndex) => (
            <article key={section.id} className="exam-card">
              <div className="card-header">
                <h3>{section.title}</h3>
                <span>
                  Play count: {playCounts[section.id] || 0}/{section.maxPlays}
                </span>
              </div>

              <div className="support-strip">
                {section.listenFor.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>

              <div className="listening-controls">
                <button
                  className={`primary-button ${activeListeningId === section.id ? 'is-active' : ''}`}
                  type="button"
                  disabled={(playCounts[section.id] || 0) >= section.maxPlays}
                  onClick={() => playListeningSection(section)}
                >
                  {activeListeningId === section.id ? 'Playing…' : `Play audio ${sectionIndex + 1}`}
                </button>
              </div>

              <div className="question-grid">
                {section.questions.map((question, index) => (
                  <QuestionCard
                    key={question.id}
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
              <span>Teacher scored later</span>
              <strong>{writingTeacherScore}/20</strong>
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
                <div className="support-strip">
                  {task.supportPoints.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
                <textarea
                  className="essay-field"
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
              <span>Teacher scored later</span>
              <strong>{speakingTeacherScore}/20</strong>
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
                <div className="support-strip">
                  {part.followUps.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>

                <div className="recording-bar">
                  {activeRecordingId === part.id ? (
                    <button className="primary-button is-recording" type="button" onClick={stopRecording}>
                      Stop recording
                    </button>
                  ) : (
                    <button className="primary-button" type="button" onClick={() => startRecording(part.id)}>
                      {recording ? 'Record again' : 'Start recording'}
                    </button>
                  )}

                  {recording && (
                    <>
                      <span className="recording-tag">{recording.durationLabel}</span>
                      <button className="ghost-button" type="button" onClick={() => deleteRecording(part.id)}>
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
          </div>
        </section>
      )}

      {currentSection === 'results' && (
        <section className="surface section-panel">
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
              <h3>Galina&apos;s picture</h3>
              <p>
                {allSectionsFinished
                  ? `All four skills are complete. The current strongest objective area is ${topStrength.toLowerCase()}, while the next revision priority is ${topRevisionPriority.toLowerCase()}.`
                  : 'The exam is still in progress. Complete all four skills to lock the final picture and certificate.'}
              </p>
            </article>
            <article className="content-card">
              <h3>What this score means</h3>
              <p>
                This is a private readiness score, not an official IELTS result. It is designed to show how securely
                Galina can use the Unit 1-45 grammar and communication patterns under mild exam pressure.
              </p>
            </article>
          </div>

          <div className="results-grid">
            <article className="result-card">
              <span>Reading</span>
              <strong>
                {readingScore.earned}/{readingScore.possible}
              </strong>
              <p>
                {readingScore.answered}/{readingScore.totalQuestions} questions answered
              </p>
            </article>

            <article className="result-card">
              <span>Listening</span>
              <strong>
                {listeningScore.earned}/{listeningScore.possible}
              </strong>
              <p>
                {listeningScore.answered}/{listeningScore.totalQuestions} questions answered
              </p>
            </article>

            <article className="result-card">
              <span>Writing</span>
              <strong>{writingTeacherScore}/20</strong>
              <p>Teacher-reviewed rubric</p>
            </article>

            <article className="result-card">
              <span>Speaking</span>
              <strong>{speakingTeacherScore}/20</strong>
              <p>Teacher-reviewed rubric</p>
            </article>
          </div>

          <div className="completion-banner">
            <div>
              <span>Total score</span>
              <strong>
                {totalScore}/{maxScore}
              </strong>
            </div>
            <div>
              <span>Percent</span>
              <strong>{totalPercent}%</strong>
            </div>
            <div>
              <span>Pass line</span>
              <strong>{examData.meta.passPercentage}%</strong>
            </div>
          </div>

          <div className="teacher-panel diagnostics-panel">
            <div className="teacher-column">
              <h3>Revision priorities</h3>
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
            <h3>Strongest objective areas</h3>
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

          <div className="action-row">
            <button className="primary-button" type="button" onClick={exportSubmission}>
              Download submission file
            </button>
            <label className="ghost-button file-trigger" htmlFor={importInputId}>
              Import reviewer file
            </label>
            <input id={importInputId} className="hidden-input" type="file" accept="application/json" onChange={importSubmission} />
            <button className="ghost-button" type="button" onClick={printCertificate}>
              Print certificate
            </button>
            <button className="ghost-button" type="button" onClick={() => setTeacherMode((current) => !current)}>
              {teacherMode ? 'Hide reviewer panel' : 'Show reviewer panel'}
            </button>
          </div>

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
              <h3>Teacher summary</h3>
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
                <strong>{totalScore}/{maxScore}</strong>
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

function QuestionCard({ index, question, value, onChange }) {
  return (
    <div className={`question-card ${isFilled(value) ? 'answered' : ''}`} style={{ '--card-delay': `${(index - 1) * 55}ms` }}>
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
          onChange={(event) => onChange(question.id, event.target.value)}
          placeholder="Write a short answer..."
          type="text"
          value={value}
        />
      )}
    </div>
  )
}

function SectionPrelude({ config }) {
  return (
    <div className="section-prelude">
      <article className="prelude-card main">
        <span className="mini-label">Coach note</span>
        <h3>{config.coachNote}</h3>
        <p>{config.strategy}</p>
      </article>

      <article className="prelude-card">
        <span className="mini-label">Focus</span>
        <div className="support-strip compact">
          {config.targetSkills.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </article>

      <article className="prelude-card">
        <span className="mini-label">Checklist</span>
        <ul className="plain-list">
          {config.checklist.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </article>
    </div>
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
