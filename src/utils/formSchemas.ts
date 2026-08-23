// The app's validation rules, as schemas (section 25c).
//
// They live together rather than beside each dialog for one reason: the
// messages have to sound like one application wrote them. Scattered across five
// components you get "Required", "This field is required", "Please enter a
// title" and "Invalid" for the same class of mistake, and nobody notices
// because no two of them are ever on screen at once.
//
// Every message says what to do, not what is wrong. "Invalid" tells a reader
// their input was rejected, which they can see; "Enter a date on or after the
// start date" tells them the move that fixes it.

import { z } from 'zod'

/** Trimmed, and required — the commonest rule in the app, written once. */
export const requiredText = (what: string, max = 200) =>
  z
    // The type message matters as much as the rule messages: a field that
    // arrives undefined (a form built with a key missing) otherwise reports
    // Zod's own "Invalid input: expected string, received undefined", which is
    // a sentence about the schema shown to somebody filling in a form.
    .string({ error: `Enter ${what}.` })
    .trim()
    .min(1, `Enter ${what}.`)
    .max(max, `Keep ${what} under ${max} characters.`)

const DATE_MESSAGE = 'Use a date in the form 2026-11-30.'
const isoDate = z.string({ error: DATE_MESSAGE }).regex(/^\d{4}-\d{2}-\d{2}$/, DATE_MESSAGE)

/** An optional date field: empty is fine, malformed is not. */
export const optionalDate = z.union([z.literal(''), isoDate], { error: DATE_MESSAGE })

export const taskFormSchema = z
  .object({
    title: requiredText('a task name'),
    deadline: optionalDate,
    startAt: optionalDate,
    project: z
      .string({ error: 'Enter a project tag, or leave it blank.' })
      .trim()
      .max(40, 'Keep a project tag under 40 characters.'),
    estimateMins: z
      .number({ error: 'Give the estimate in whole minutes, or leave it blank.' })
      .int('Give the estimate in whole minutes.')
      .min(0, 'An estimate cannot be negative.')
      .max(60 * 24 * 30, 'That estimate is longer than a month — check the units.')
      .nullable(),
  })
  .refine((v) => !v.startAt || !v.deadline || v.startAt <= v.deadline, {
    // Attached to `deadline`, because that is the field the reader was editing
    // when the pair stopped making sense. An error on `startAt` would point at
    // the value they set first and are least likely to want to change.
    path: ['deadline'],
    message: 'Enter a due date on or after the start date.',
  })

export type TaskForm = z.infer<typeof taskFormSchema>

export const goalFormSchema = z
  .object({
    title: requiredText('a goal name'),
    description: z
      .string({ error: 'Enter a description, or leave it blank.' })
      .max(2000, 'Keep the description under 2000 characters.'),
    startAt: optionalDate,
    targetAt: optionalDate,
    color: z.string({ error: 'Pick a colour.' }),
    status: z.enum(['active', 'paused', 'done'], {
      error: 'Choose active, paused or done.',
    }),
  })
  .refine((v) => !v.startAt || !v.targetAt || v.startAt <= v.targetAt, {
    path: ['targetAt'],
    message: 'Enter a target date on or after the start date.',
  })

export type GoalForm = z.infer<typeof goalFormSchema>

export const reminderFormSchema = z.object({
  text: requiredText('what to be reminded of'),
  at: isoDate,
  time: z
    .string({ error: 'Use a time in the form 09:30.' })
    .regex(/^\d{2}:\d{2}$/, 'Use a time in the form 09:30.'),
})

export type ReminderForm = z.infer<typeof reminderFormSchema>

export const repoLinkSchema = z.object({
  // Two slashes and no protocol: "owner/repo" is what the API takes, and
  // pasting a URL is the mistake worth naming rather than rejecting silently.
  repo: z
    .string({ error: 'Enter a repository as owner/name.' })
    .trim()
    .min(1, 'Enter a repository as owner/name.')
    .regex(/^[\w.-]+\/[\w.-]+$/, 'Enter it as owner/name — not a full GitHub URL.'),
})

export type RepoLinkForm = z.infer<typeof repoLinkSchema>
