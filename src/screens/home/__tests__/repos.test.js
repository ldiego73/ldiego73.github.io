import axios from "axios"
import * as React from "react"
import { act, render, waitFor } from "@testing-library/react"

import { Repos } from "../components/repos"

import "../../../../__mocks__/console"

jest.mock("axios")

const data = [
  {
    fork: false,
    stargazers_count: 3,
    forks: 3,
    html_url: "",
    name: "",
    description: "",
    language: "JavaScript",
    size: 100,
  },
]

beforeEach(() => {
  // we're using fake timers because we don't want to
  // wait a full second for this test to run.
  jest.useFakeTimers()

  axios.get.mockImplementationOnce(() => Promise.resolve({ data }))
})

afterEach(() => {
  jest.useRealTimers()
})

describe(`Repos`, () => {
  it("renders correctly", () => {
    const { container } = render(<Repos />)

    expect(container).toBeInTheDocument()
  })

  it("load repositories success", async () => {
    const { getByTestId } = render(<Repos />)

    act(() => jest.advanceTimersByTime(1000))

    await waitFor(() => getByTestId("repo-project-0"), { timeout: 1000 })

    expect(getByTestId("repo-project-0")).toBeInTheDocument()
  })
})
