import { execFileSync } from 'node:child_process'

const requestQuit = `
  ObjC.import('AppKit')

  function run(args) {
    const [bundleIdentifier, bundlePath, expectedPid] = args
    const running = $.NSRunningApplication.runningApplicationsWithBundleIdentifier(bundleIdentifier)
    const matches = []
    for (let index = 0; index < running.count; index++) {
      const candidate = running.objectAtIndex(index)
      if (ObjC.unwrap(candidate.bundleURL.path) === bundlePath &&
          (!expectedPid || candidate.processIdentifier === Number(expectedPid))) {
        matches.push(candidate)
      }
    }
    if (matches.length !== 1) {
      throw new Error('Expected one running application at ' + bundlePath)
    }
    const application = matches[0]
    if (expectedPid && !application.terminate) {
      throw new Error('macOS refused the normal quit request.')
    }
    return String(application.processIdentifier)
  }
`

export function getRunningMacAppPid(bundleIdentifier, bundlePath) {
  return sendMacAppRequest(bundleIdentifier, bundlePath, '')
}

export function requestMacAppQuit(bundleIdentifier, bundlePath, expectedPid) {
  return sendMacAppRequest(bundleIdentifier, bundlePath, String(expectedPid))
}

function sendMacAppRequest(bundleIdentifier, bundlePath, expectedPid) {
  const pid = execFileSync(
    '/usr/bin/osascript',
    ['-l', 'JavaScript', '-e', requestQuit, bundleIdentifier, bundlePath, expectedPid],
    { encoding: 'utf8', timeout: 15_000 }
  ).trim()
  return Number(pid)
}
