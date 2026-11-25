import { describe, expect, it } from 'vitest'
import { parseCnbRemote, parseCnbReviewUrl } from './repository-ref'

describe('CNB repository identity', () => {
  it('retains nested repository paths for HTTPS, SSH, and PR URLs', () => {
    expect(parseCnbRemote('https://cnb.cool/team/group/project.git')).toBe('team/group/project')
    expect(parseCnbRemote('git@cnb.cool:team/group/project.git')).toBe('team/group/project')
    expect(parseCnbReviewUrl('https://cnb.cool/team/group/project/-/pulls/23')).toEqual({
      repository: 'team/group/project',
      number: 23
    })
  })

  it('refuses untrusted hosts, encoded separators, and normalized traversal', () => {
    expect(parseCnbRemote('https://cnb.cool.example/team/repo.git')).toBeNull()
    expect(parseCnbRemote('https://cnb.cool/team/%2e%2e/group/project')).toBeNull()
    expect(parseCnbReviewUrl('https://cnb.cool/team%2Fgroup/project/-/pulls/23')).toBeNull()
    expect(parseCnbReviewUrl('https://cnb.cool@other.example/team/project/-/pulls/23')).toBeNull()
  })
})
