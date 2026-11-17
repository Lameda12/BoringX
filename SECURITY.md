# Security policy

## Reporting a vulnerability

Please report security problems privately, not in a public issue.

Use GitHub's private reporting: open the repository's **Security** tab and choose **Report a vulnerability**. Include what you found, the page or tool involved, and steps to reproduce it. A proof of concept helps but is not required.

You can expect an acknowledgement within 7 days. This is a one-person project, so a fix may take longer; you will get a status update at least every 14 days until it is resolved. Please give a reasonable window to fix the problem before disclosing it publicly.

## Supported versions

Only the latest deployment of `main` (https://boringx.vercel.app) is supported. There are no maintained older releases.

## Scope

BoringX is a static site. All processing happens in the visitor's browser, and there is no server, database or account system. The things most worth reporting:

- A way to make the site send user data to another host, or to bypass the Content-Security-Policy in `vercel.json`
- Cross-site scripting through a tool's output, a Sandbox share link (the `#r=` recipe) or an uploaded file
- Anything that escapes the isolated Worker used by the Custom JavaScript block
- A vulnerable dependency that is actually reachable from the shipped code

Out of scope: findings that need a compromised browser or device, denial of service from deliberately huge local files, and issues in third-party sites that merely link here.

## Known dependency advisories

`xlsx` (SheetJS) has open advisories with no fixed version on npm. It is used only to read spreadsheets that the visitor chooses to open in their own browser tab. `@imgly/background-removal` pulls in `lodash` and `zod` versions with advisories; these are being tracked.
