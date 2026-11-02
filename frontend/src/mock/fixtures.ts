import demoData from './demo-data.json'

export interface DemoJob {
  name: string
  text: string
}

export const SAMPLE_DRAFT_TEXT = demoData.draftText

export const SAMPLE_JDS: DemoJob[] = demoData.jobs

export const SAMPLE_JD_FRONTEND = demoData.jobs[0]!.text

export const SAMPLE_JD_BACKEND = demoData.jobs[1]!.text
