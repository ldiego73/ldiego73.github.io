import axios from "axios"
import { useEffect, useState } from "react"

export function useFetch(url, options = {}) {
  const [response, setResponse] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const abortController = new AbortController()
    const { signal } = abortController
    const isNotAborted = () => !signal.aborted

    const doFetch = async () => {
      /* istanbul ignore else */
      if (isNotAborted()) {
        setLoading(true)
      }

      try {
        const { data } = await axios.get(url, options)

        /* istanbul ignore else */
        if (isNotAborted()) {
          setResponse(data)
        }
      } catch (e) {
        /* istanbul ignore else */
        if (isNotAborted()) {
          setError(e)
        }
      } finally {
        /* istanbul ignore else */
        if (isNotAborted()) {
          setLoading(false)
        }
      }
    }
    doFetch()

    return () => {
      abortController.abort()
    }
  }, [])

  return [response, error, loading]
}
