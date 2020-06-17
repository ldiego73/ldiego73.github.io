import { useFetch } from "@hooks/use-fetch"
import { act, renderHook } from "@testing-library/react-hooks"

beforeEach(() => {
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

describe(`Use Fetch`, () => {
  it("Load todos correctly", async () => {
    const url = "https://jsonplaceholder.typicode.com/todos"
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
