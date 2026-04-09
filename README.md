# Galina Exam Website

Private IELTS-style English practice exam for Galina, designed as a reusable static template for GitHub Pages.

## What Is Included

- A premium one-student exam UI with English plus light Russian support
- Four sections: reading, listening, writing, and speaking
- Auto-scoring for reading and listening
- Teacher-review rubrics for writing and speaking
- Browser-based audio playback for listening with TTS fallback
- Browser-based speaking recording
- Submission export/import as JSON for remote review without a backend
- Printable completion certificate

## Tech Stack

- React 19
- Vite
- Static hosting compatible with GitHub Pages

## Run Locally

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
npm run preview
```

## Main Content File

Update the actual exam content in:

- `src/examData.js`

That file controls:

- student name
- teacher name
- section texts
- listening scripts
- writing prompts
- speaking prompts
- rubric labels
- certificate text
- pass percentage

## Important Practical Notes

- The current listening section uses browser speech synthesis. For a better final voice, replace the scripted text with pre-generated MP3 files and add `audioSrc` values in `src/examData.js`.
- Because this is a static GitHub Pages site with no backend, the candidate should download the submission JSON at the end and send it to Ramazan for review.
- Speaking recordings are included in the exported JSON so the teacher can import the file later and listen inside the same app.
- Local browser storage is used for progress, but exported submissions are the reliable handoff format.

## Deploy To GitHub Pages

This project is already prepared for GitHub Pages with a workflow at:

- `.github/workflows/deploy.yml`

The workflow uses GitHub Pages Actions and automatically passes the correct Pages base path into Vite during the production build.

### One-Time Repository Setup

1. Create a GitHub repository for this folder.
2. In the repository settings, open `Settings -> Pages`.
3. Under `Build and deployment`, set `Source` to `GitHub Actions`.
4. Push the project to the `main` branch.

### Recommended CLI Flow

If you want to use the GitHub CLI:

```bash
git init -b main
git add .
git commit -m "Initial Galina exam site"
gh repo create webforexam --public --source=. --remote=origin --push
```

After the repository exists, GitHub Actions will deploy the site on every push to `main`.

### Local Pages-Like Build Check

Normal local build:

```bash
npm run build
```

Simulate a project Pages base path:

```bash
BASE_PATH="/webforexam/" npm run build
```

That second command is useful because the current repository name is `webforexam`.

## Suggested Final Content Before Galina Uses It

- Replace the seeded sample texts with your final exam content.
- Replace TTS scripts with final audio or polished TTS audio files.
- Confirm the pass threshold and certificate wording.
- Test microphone permissions on the exact browser/device Galina will use.
