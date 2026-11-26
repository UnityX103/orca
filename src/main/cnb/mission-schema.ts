import { z } from 'zod'
import { labelArray, numberField } from './task-schema'

export const missionRow = z.object({
  path: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  visibility_level: z.string().nullish()
})

export const missionViewRow = z.object({ id: z.string(), name: z.string(), type: z.string() })

export const missionFieldRow = z.object({
  name: z.string(),
  interaction_type: z.string().nullish(),
  operators: z.array(z.string()).nullish(),
  value: z.array(z.unknown()).nullish()
})

export const missionViewConfigRow = z.object({
  id: z.string(),
  selectors: z
    .array(
      z.object({
        field: z.string(),
        operator: z.string(),
        value: z.array(z.string()).nullish()
      })
    )
    .nullish(),
  sorts: z.array(z.object({ field: z.string(), order: z.string().nullish() })).nullish(),
  fields: z.array(z.object({ field: z.string() })).nullish()
})

export const missionUser = z.object({
  username: z.string().nullish(),
  nickname: z.string().nullish()
})

export const missionIssueResource = z.object({
  repo_slug: z.string(),
  number: numberField,
  title: z.string(),
  state: z.string().nullish(),
  author: missionUser.nullish(),
  assignees: z.array(missionUser).nullish(),
  priority: z.string().nullish(),
  labels: labelArray,
  updated_at: z.string().nullish()
})

export const missionPullResource = z.object({
  repo_slug: z.string(),
  number: numberField,
  title: z.string(),
  state: z.string().nullish(),
  is_merged: z.boolean().nullish(),
  author: missionUser.nullish(),
  assignees: z.array(missionUser).nullish(),
  labels: labelArray,
  updated_at: z.string().nullish()
})

export const missionResources = z.object({
  issues: z.array(missionIssueResource).nullish(),
  pull_requests: z.array(missionPullResource).nullish(),
  next_cursor: z.string().nullish(),
  total: z.number().nullish()
})

export const tokenIntrospection = z.object({ scopes: z.array(z.string()).nullish() })
