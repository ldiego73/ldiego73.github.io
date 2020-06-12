import React, { useState, useEffect } from "react"

import "./top-button.scss"

import pointingUp from "../../images/pointing-up.png"

const TopButton = () => {
  const [showScroll, setShowScroll] = useState(false)
  const offset = 100

  const scrollTop = () => {
    typeof window !== "undefined" &&
      window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const handleScroll = () => {
    if (typeof window !== "undefined") {
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
    typeof window !== "undefined" &&
      window.addEventListener("scroll", handleScroll, { passive: true })

    return () =>
      typeof window !== "undefined" &&
      window.removeEventListener("scroll", handleScroll)
  }, [])

  console.log(showScroll)

  return (
    <button
      className="top-button"
      aria-label="Top Button"
      onClick={scrollTop}
      style={{ display: showScroll ? "block" : "none" }}
    >
      <img src={pointingUp} alt="Top Button" />
    </button>
  )
}

export { TopButton }
