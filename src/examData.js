export const examData = {
  meta: {
    examTitle: "Galina's Unit 45 Readiness Exam",
    subtitle: 'Private IELTS-style practice test after Essential Grammar in Use Elementary, Units 1-45',
    studentName: 'Galina',
    teacherName: 'Ramazan Odinayev',
    supportLanguage: 'English with light Russian support',
    focusUnits: 'Essential Grammar in Use Elementary (2015), Units 1-45',
    focusAreas: ['Past simple', 'Present perfect', 'Passive voice', 'Question forms'],
    estimatedMinutes: 180,
    passPercentage: 70,
    certificateTitle: 'Certificate of Completion',
    certificateSubtitle:
      'Galina completed her personalised Unit 45 English readiness exam and finished all assessed skills.',
    certificateFooter:
      'This document confirms completion of a private IELTS-style practice session prepared and reviewed by Ramazan Odinayev.',
    accessCodeEnabled: true,
  },
  overview: {
    intro:
      "This exam is designed only for Galina. It checks how well she can understand, use, and produce the grammar and communication patterns covered up to Unit 45.",
    introRu:
      'Этот экзамен сделан только для Галины. Он проверяет, насколько уверенно она понимает и использует материал до 45-го юнита.',
    mission:
      'This should feel calm, serious, and elegant. It is not a school worksheet. It is a private readiness session designed around Galina’s actual progress.',
    missionRu:
      'Экзамен должен ощущаться спокойно, серьёзно и красиво. Это не обычный школьный тест, а персональная проверка готовности.',
    rules: [
      'Complete the exam in a quiet room and use headphones for listening.',
      'Do not open the grammar book during the test.',
      'The exam timer is three hours and starts after pressing Start exam.',
      'Each listening track can be played only three times.',
      'Finish the writing tasks before you record speaking.',
      'Your answers and speaking recordings are saved automatically for Ramazan to review later.',
    ],
    preflightChecklist: [
      'Headphones ready',
      'Quiet room',
      'Microphone permission allowed',
      'No grammar book or notes open',
      'Time available for one full sitting',
    ],
    designedFor: [
      'Galina usually improves when she slows down and checks time reference carefully.',
      'Past simple and present perfect still need clean separation under pressure.',
      'Passive voice is understood better than it is produced.',
      'Question forms are stronger now, but speed can still reduce accuracy.',
    ],
    successPicture: [
      'Confident reading without overthinking every sentence.',
      'Disciplined listening with calm note capture.',
      'Natural grammar control inside personal writing.',
      'Clear speaking with fewer frozen pauses.',
    ],
    signatureMoments: [
      'Reading checks detail and grammar meaning together.',
      'Listening is timed and disciplined, with only three plays.',
      'Writing requires controlled grammar, not only ideas.',
      'Speaking should sound natural, calm, and clear.',
    ],
    sections: [
      {
        id: 'reading',
        title: 'Reading',
        titleRu: 'Чтение',
        duration: '25 min',
        points: 20,
        description:
          'Read two short texts and answer meaning-focused questions connected to the grammar studied in Units 1-45.',
      },
      {
        id: 'listening',
        title: 'Listening',
        titleRu: 'Аудирование',
        duration: '20 min',
        points: 20,
        description:
          'Listen to two short recordings and answer detail questions about lesson review, time, sequence, and grammar focus.',
      },
      {
        id: 'writing',
        title: 'Writing',
        titleRu: 'Письмо',
        duration: '25 min',
        points: 20,
        description:
          'Write one practical message and one personal reflection using the grammar from the studied units.',
      },
      {
        id: 'speaking',
        title: 'Speaking',
        titleRu: 'Говорение',
        duration: '20 min',
        points: 20,
        description:
          'Record three IELTS-style speaking responses about study habits, progress, and learning strategies.',
      },
    ],
  },
  reading: {
    sectionTitle: 'Reading | Чтение',
    instruction:
      'Read the texts carefully. Answer in English. For short answers, use only the necessary words.',
    coachNote:
      'This section is not only about understanding the story. It is also checking whether Galina notices time reference, tense meaning, passive structures, and question meaning inside context.',
    strategy:
      'Read once for the general idea, then return to each question and underline the exact words or grammar clue that supports the answer.',
    checklist: [
      'Notice time words such as last week, since, already, yesterday',
      'Watch whether the verb is active or passive',
      'Do not add extra words in short answers',
    ],
    targetSkills: ['Reading for detail', 'Tense meaning', 'Passive recognition', 'Question logic'],
    passages: [
      {
        id: 'progress-journal',
        title: "Galina's Progress Journal",
        text: [
          'Since February, Galina has followed a clearer study plan. She has completed forty-five grammar units and has kept a short record after each lesson. At first, she wrote only a few lines, but now she usually adds examples, questions, and a short personal comment about what felt easy or difficult.',
          'In the beginning, she often mixed up the past simple and the present perfect. For example, she once wrote, "I have finished Unit 12 yesterday," and her teacher corrected the sentence. Last month, they revised time expressions again, and the difference became clearer. Galina now checks whether a finished time is mentioned before she chooses the tense.',
          'Recently, she has become more confident when she hears direct and indirect questions. She still needs to slow down when she answers under pressure, but she no longer freezes for a long time. Passive forms are still less natural for her, so Ramazan has included extra passive voice practice in the final review before the exam.',
        ],
        questions: [
          {
            id: 'reading-1',
            type: 'trueFalseNotGiven',
            prompt: 'Galina has already completed forty-five grammar units.',
            answer: 'true',
            points: 2,
            tags: ['Present perfect'],
          },
          {
            id: 'reading-2',
            type: 'shortText',
            prompt: 'What has she kept after each lesson?',
            answer: ['a short record', 'short record', 'record'],
            points: 2,
            tags: ['Present perfect'],
          },
          {
            id: 'reading-3',
            type: 'multipleChoice',
            prompt: 'What mistake did she make in one sentence?',
            options: [
              'She used a passive sentence incorrectly.',
              'She used the present perfect with a finished time expression.',
              'She used an indirect question instead of a direct one.',
              'She forgot to use an auxiliary verb in the present simple.',
            ],
            answer: 'She used the present perfect with a finished time expression.',
            points: 2,
            tags: ['Past simple', 'Present perfect'],
          },
          {
            id: 'reading-4',
            type: 'trueFalseNotGiven',
            prompt: 'Galina finds passive forms more natural than direct questions.',
            answer: 'false',
            points: 2,
            tags: ['Passive voice', 'Question forms'],
          },
          {
            id: 'reading-5',
            type: 'shortText',
            prompt: 'What kind of questions does she hear more confidently now?',
            answer: [
              'direct and indirect questions',
              'direct and indirect',
            ],
            points: 2,
            tags: ['Question forms'],
          },
        ],
      },
      {
        id: 'open-day',
        title: 'An English Open Day',
        text: [
          'An English open day was organised at the language centre in March. The invitation was written by one teacher and shared online two days later. Parents and students were asked to bring one short text in English, and a reading corner was set up near the main entrance.',
          'On the morning of the event, the rooms were decorated, the chairs were moved, and a welcome table was prepared near the door. A listening corner was created with headphones, and each visitor was given a short answer sheet. The programme was expected to last two hours, but it continued for almost three because many questions were asked at the end.',
          'After the event, several photos were posted online, and another open day has already been planned for early summer. The organisers said that the first event was useful because shy students spoke more than usual when they were given simple tasks and enough time.',
        ],
        questions: [
          {
            id: 'reading-6',
            type: 'shortText',
            prompt: 'Who wrote the invitation?',
            answer: ['one teacher', 'a teacher', 'teacher'],
            points: 2,
            tags: ['Passive voice'],
          },
          {
            id: 'reading-7',
            type: 'shortText',
            prompt: 'Where was the reading corner set up?',
            answer: [
              'near the main entrance',
              'by the main entrance',
              'near the entrance',
            ],
            points: 2,
            tags: ['Passive voice'],
          },
          {
            id: 'reading-8',
            type: 'multipleChoice',
            prompt: 'How long was the programme expected to last?',
            options: [
              'One hour',
              'Two hours',
              'Almost three hours',
              'All morning',
            ],
            answer: 'Two hours',
            points: 2,
            tags: ['Passive voice', 'Past simple'],
          },
          {
            id: 'reading-9',
            type: 'trueFalseNotGiven',
            prompt: 'The first open day was cancelled because too few parents came.',
            answer: 'not given',
            points: 2,
            tags: ['Passive voice'],
          },
          {
            id: 'reading-10',
            type: 'multipleChoice',
            prompt: 'Why has another open day already been planned?',
            options: [
              'The first event was useful and successful.',
              'The school has changed its director.',
              'Parents asked for a grammar-only lesson.',
              'The first event lasted less time than expected.',
            ],
            answer: 'The first event was useful and successful.',
            points: 2,
            tags: ['Present perfect', 'Passive voice'],
          },
        ],
      },
    ],
  },
  listening: {
    sectionTitle: 'Listening | Аудирование',
    instruction:
      'Use headphones if possible. Each track can be played three times. It cannot be paused, slowed down, or scrubbed.',
    playerNote:
      'Press play only when you are ready. Watch the progress line and remaining time while the track runs.',
    coachNote:
      'Listening should feel disciplined. Galina needs to catch exact details, tense reference, and passive forms without reading a transcript.',
    strategy:
      'Before pressing play, scan the questions quickly and decide what kind of detail you are listening for: date, action, grammar contrast, or instruction.',
    checklist: [
      'Read the questions before playback',
      'Keep track of dates, days, and numbers',
      'Listen for grammar contrasts, not only keywords',
    ],
    targetSkills: ['Detail listening', 'Instruction tracking', 'Grammar hearing', 'Timed focus'],
    sections: [
      {
        id: 'listening-review',
        title: 'Audio 1: Ramazan reviews the last week',
        maxPlays: 3,
        audioSrc: `${import.meta.env.BASE_URL}audio/listening-review.m4a`,
        listenFor: [
          'day and sequence',
          'difference between direct and indirect questions',
          'past simple versus present perfect',
        ],
        questions: [
          {
            id: 'listening-1',
            type: 'shortText',
            prompt: 'On which day did they finish Unit 45?',
            answer: ['tuesday', 'on tuesday'],
            points: 2,
            tags: ['Question forms'],
          },
          {
            id: 'listening-2',
            type: 'multipleChoice',
            prompt: 'Which kind of questions were slower for Galina?',
            options: [
              'Direct questions',
              'Indirect questions',
              'Present simple questions',
              'Past simple questions',
            ],
            answer: 'Indirect questions',
            points: 2,
            tags: ['Question forms'],
          },
          {
            id: 'listening-3',
            type: 'multipleChoice',
            prompt: 'Which tense contrast did Ramazan revise with her?',
            options: [
              'Present simple and passive',
              'Past simple and present perfect',
              'Future forms and modals',
              'Past continuous and past perfect',
            ],
            answer: 'Past simple and present perfect',
            points: 2,
            tags: ['Past simple', 'Present perfect'],
          },
          {
            id: 'listening-4',
            type: 'shortText',
            prompt: 'What did they work on on Friday?',
            answer: ['the passive voice', 'passive voice', 'passive'],
            points: 2,
            tags: ['Passive voice'],
          },
          {
            id: 'listening-5',
            type: 'shortText',
            prompt: 'How long should Galina revise her notebook tonight?',
            answer: ['twenty minutes', '20 minutes', '20'],
            points: 2,
            tags: ['Past simple'],
          },
        ],
      },
      {
        id: 'listening-project',
        title: 'Audio 2: Class project announcement',
        maxPlays: 3,
        audioSrc: `${import.meta.env.BASE_URL}audio/listening-project.m4a`,
        listenFor: [
          'who did the action',
          'what has already been completed',
          'what will happen next',
        ],
        questions: [
          {
            id: 'listening-6',
            type: 'shortText',
            prompt: 'Who chose the title?',
            answer: ['the students', 'students'],
            points: 2,
            tags: ['Passive voice'],
          },
          {
            id: 'listening-7',
            type: 'trueFalseNotGiven',
            prompt: 'The poster has already been printed.',
            answer: 'true',
            points: 2,
            tags: ['Present perfect', 'Passive voice'],
          },
          {
            id: 'listening-8',
            type: 'shortText',
            prompt: 'How many interviews were recorded yesterday?',
            answer: ['two', '2'],
            points: 2,
            tags: ['Past simple', 'Passive voice'],
          },
          {
            id: 'listening-9',
            type: 'shortText',
            prompt: 'When will the final version be checked?',
            answer: [
              'on tuesday morning',
              'tuesday morning',
            ],
            points: 2,
            tags: ['Passive voice'],
          },
          {
            id: 'listening-10',
            type: 'multipleChoice',
            prompt: 'What will happen after visitors listen to the recordings?',
            options: [
              'They will write full essays.',
              'They will answer five simple questions.',
              'They will record their own interviews.',
              'They will choose a new project title.',
            ],
            answer: 'They will answer five simple questions.',
            points: 2,
            tags: ['Question forms', 'Passive voice'],
          },
        ],
      },
    ],
  },
  writing: {
    sectionTitle: 'Writing | Письмо',
    instruction:
      'Write clearly and naturally. Ramazan will review these tasks manually after the exam is submitted.',
    coachNote:
      'Writing is where controlled grammar has to become personal language. The answer should sound like Galina, but the structure should stay clean and deliberate.',
    strategy:
      'Plan briefly before writing. Decide where you will place the grammar targets so they sound natural rather than forced.',
    checklist: [
      'Use full sentences with clear punctuation',
      'Control the target grammar deliberately',
      'Check the word range before moving on',
    ],
    targetSkills: ['Practical writing', 'Paragraph control', 'Grammar integration', 'Clarity'],
    tasks: [
      {
        id: 'writing-1',
        title: 'Task 1: Practical email',
        titleRu: 'Практическое письмо',
        minWords: 90,
        maxWords: 120,
        prompt:
          'Write an email to Ramazan after the exam. Tell him which section felt calmest, explain one grammar area that still made you hesitate, and ask what kind of practice should come before the next level.',
        supportPoints: [
          'Sound natural and polite, not too formal',
          'Mention one real strength from today',
          'Name one grammar difficulty honestly',
          'Finish with one clear question about the next stage',
        ],
      },
      {
        id: 'writing-2',
        title: 'Task 2: Personal reflection',
        titleRu: 'Личная рефлексия',
        minWords: 130,
        maxWords: 170,
        prompt:
          'Write a short reflection for your future self about how your English has changed from the beginning of this course to Unit 45. Explain what has helped most, which mistake still returns, and how you want to work before the next level. Include at least one past simple sentence, one present perfect sentence, one passive sentence, and one indirect question.',
        supportPoints: [
          'Make it personal, not abstract',
          'Use one true example from your own study routine',
          'Place the four grammar targets naturally',
          'End with a realistic plan for the next stage',
        ],
      },
    ],
    rubric: [
      {
        id: 'taskResponse',
        label: 'Task response',
        labelRu: 'Ответ на задание',
      },
      {
        id: 'organisation',
        label: 'Organisation',
        labelRu: 'Организация текста',
      },
      {
        id: 'vocabulary',
        label: 'Vocabulary',
        labelRu: 'Словарный запас',
      },
      {
        id: 'grammar',
        label: 'Grammar control',
        labelRu: 'Контроль грамматики',
      },
    ],
  },
  speaking: {
    sectionTitle: 'Speaking | Говорение',
    instruction:
      'Record one answer for each part. Speak naturally and clearly. Do not try to memorise a full script.',
    browserNote:
      'Chrome and Safari usually handle microphone recording best. Download your submission before you close the browser tab.',
    coachNote:
      'Speaking should sound alive, not memorised. The goal is calm control, not perfection. Short pauses are acceptable; frozen silence is what we want to avoid.',
    strategy:
      'Think in ideas, not in full memorised sentences. Keep the answer moving and support each point with one small example.',
    checklist: [
      'Speak in complete ideas',
      'Give at least one example in each recording',
      'Stay calm and keep going if you correct yourself',
    ],
    targetSkills: ['Fluency', 'Natural grammar use', 'Confidence under pressure', 'Clear organisation'],
    parts: [
      {
        id: 'speaking-1',
        title: 'Part 1: Personal questions',
        duration: '1-2 min',
        prompt:
          'Introduce yourself and describe your English study routine now. Then explain what has changed since you began working regularly with Ramazan and what feels more comfortable now than before.',
        followUps: [
          'When do you usually study?',
          'What feels easier than it did at the beginning?',
          'Which part still slows you down?',
        ],
      },
      {
        id: 'speaking-2',
        title: 'Part 2: Long turn',
        duration: '2 min',
        prompt:
          'Describe one lesson, correction, or explanation that changed the way you understand English grammar. Say when it happened, what was practised, what you understood differently after that, and why it mattered for your confidence.',
        followUps: [
          'Name the grammar area',
          'Say what changed after that moment',
          'Explain why it mattered for your confidence',
        ],
      },
      {
        id: 'speaking-3',
        title: 'Part 3: Discussion',
        duration: '2-3 min',
        prompt:
          'Answer these questions in one recording: Why do students repeat the same grammar mistake even after correction? For a student like you, which is harder to control under pressure: tenses, passive voice, or question forms? What should a teacher do before moving a student to the next level?',
        followUps: [
          'Give one reason for repeated mistakes',
          'Compare the difficult areas clearly',
          'Suggest one practical teacher strategy',
        ],
      },
    ],
    rubric: [
      {
        id: 'fluency',
        label: 'Fluency and coherence',
        labelRu: 'Беглость и связность',
      },
      {
        id: 'vocabulary',
        label: 'Lexical resource',
        labelRu: 'Лексика',
      },
      {
        id: 'grammar',
        label: 'Grammar range and accuracy',
        labelRu: 'Грамматика',
      },
      {
        id: 'pronunciation',
        label: 'Pronunciation',
        labelRu: 'Произношение',
      },
    ],
  },
}
