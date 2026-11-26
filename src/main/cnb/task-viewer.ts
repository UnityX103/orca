import { z } from 'zod'
import type { CnbRepositoryTarget } from './task-list'
import { cnbRequest, discardCnbBody } from './request'
import { cnbRepositoryPath } from './repository-ref'
import { credential } from './task-schema'

export type CnbViewer = { username: string; nickname: string | null }

export async function readCnbViewer(): Promise<CnbViewer | null> {
  const token = await credential()
  if (!token) {
    return null
  }
  try {
    const response = await cnbRequest('/user', token)
    if (!response.ok) {
      await discardCnbBody(response)
      return null
    }
    const user = z
      .object({ username: z.string(), nickname: z.string().nullish() })
      .parse(await response.json())
    return { username: user.username, nickname: user.nickname ?? null }
  } catch {
    return null
  }
}

export async function readCnbLabels(repositories: CnbRepositoryTarget[]): Promise<string[]> {
  const token = await credential()
  if (!token) {
    return []
  }
  const names = new Set<string>()
  await Promise.all(
    repositories.map(async (repo) => {
      try {
        const response = await cnbRequest(`${cnbRepositoryPath(repo.slug)}/labels`, token, {
          page: '1',
          page_size: '100'
        })
        if (!response.ok) {
          await discardCnbBody(response)
          return
        }
        const rows = z
          .array(z.object({ name: z.string() }))
          .nullish()
          .parse(await response.json())
        for (const row of rows ?? []) {
          names.add(row.name)
        }
      } catch {
        // A repo without label access contributes nothing rather than failing the whole list.
      }
    })
  )
  return [...names].sort((a, b) => a.localeCompare(b))
}
