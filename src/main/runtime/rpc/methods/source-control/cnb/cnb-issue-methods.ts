import { CnbIssueReference } from '../../../../../../shared/rpc-contract/source-control/cnb-issue-params'
import { closeLinkedCnbIssue, readLinkedCnbIssue } from '../../../../../cnb/linked-issue'
import { defineMethod } from '../../../core'

export const CNB_ISSUE_METHODS = [
  defineMethod({
    name: 'cnb.getIssueStatus',
    permission: 'workspace',
    params: CnbIssueReference,
    handler: ({ url }) => readLinkedCnbIssue(url)
  }),
  defineMethod({
    name: 'cnb.closeIssue',
    permission: 'workspace',
    params: CnbIssueReference,
    handler: ({ url }) => closeLinkedCnbIssue(url)
  })
]
