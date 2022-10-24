import "./top-button.scss"

import { isBrowser } from "@utils/browser"
import React, { useEffect, useState } from "react"

import pointingUp from "../../images/pointing-up.png"

function TopButton() {
  const [showScroll, setShowScroll] = useState(false)
  const offset = 100

  const scrollTop = () => {
    isBrowser() && window.scrollTo({ top: 0, behavior: "smooth" })
  }

  /* istanbul ignore next */
  const handleScroll = () => {
    if (isBrowser()) {
      if (
        document.body.scrollTop > offset ||
        document.documentElement.scrollTop > offset
      ) {
        setShowScroll(true)
      } else {
        setShowScroll(false)
      }
    }
  }

  useEffect(() => {
    isBrowser() &&
      window.addEventListener("scroll", handleScroll, { passive: true })

    return () =>
      isBrowser() && window.removeEventListener("scroll", handleScroll)
  }, [])

  return (
    <button
      type="button"
      className="top-button"
      aria-label="Top Button"
      onClick={scrollTop}
      style={{ display: showScroll ? "block" : "none" }}
      data-testid="top-button"
    >
      <img src={pointingUp} alt="Top Button" />
    </button>
  )
}

export { TopButton }
