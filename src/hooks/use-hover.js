import { useRef, useState, useEffect } from "react"

export function useHover() {
  const [value, setValue] = useState(false)

  const ref = useRef(null)

  useEffect(() => {
    const handleMouseOver = () => setValue(true)
    const handleMouseOut = () => setValue(false)
    const element = ref && ref.current

    /* istanbul ignore next */
    if (element) {
      element.addEventListener("mouseover", handleMouseOver)
      element.addEventListener("mouseout", handleMouseOut)
      return () => {
        element.removeEventListener("mouseover", handleMouseOver)
        element.removeEventListener("mouseout", handleMouseOut)
      }
    }
  }, [ref])

  return [ref, value]
}
