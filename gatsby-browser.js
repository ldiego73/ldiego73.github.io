/* eslint-disable no-alert */

/**
 * Implement Gatsby's Browser APIs in this file.
 *
 * See: https://www.gatsbyjs.org/docs/browser-apis/
 */

// You can delete this file if you're not using it

export const onServiceWorkerUpdateReady = () => {
  let answer

  if (process.env.NODE_ENV !== "production") {
    answer = window.confirm(
      "This application has been updated. Reload to display the latest version?"
    )
  } else {
    answer = true
  }

  if (answer === true) {
    window.location.reload()
  }
}
