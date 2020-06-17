import { useFetch } from "@hooks/use-fetch"
import { act, renderHook } from "@testing-library/react-hooks"
import axios from "axios"

jest.mock("axios")

beforeEach(() => {
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

describe(`Use Fetch`, () => {
  it("Load todos correctly", async () => {
    axios.get.mockImplementationOnce(() => Promise.resolve({ data: [] }))

    const url = "https://URL_SUCCESS"
    const { result, waitForNextUpdate } = renderHook(() => useFetch(url))

    setImmediate(() => {
      act(() => {
        jest.runAllTimers()
      })
    })

    await waitForNextUpdate()

    const [response, error, loading] = result.current

    expect(loading).toBeFalsy()
    expect(error).toBeNull()
    expect(Array.isArray(response)).toBeTruthy()
  })

  it("Load todos with error", async () => {
    axios.get.mockImplementationOnce(() =>
      Promise.reject(new Error("Network Error"))
    )

    const url = "https://NOT_FOUND_URL"
    const { result, waitForNextUpdate } = renderHook(() => useFetch(url))

    setImmediate(() => {
      act(() => {
        jest.runAllTimers()
      })
    })

    await waitForNextUpdate()

    const [response, error, loading] = result.current

    expect(loading).toBeFalsy()
    expect(response).toBeNull()
    expect(error).not.toBeNull()
    expect(error.message).toBe("Network Error")
  })
})
