import { fireEvent, render } from "@testing-library/react"
import * as React from "react"

import { TopButton } from "../top-button"

const spyScrollTo = jest.fn()

beforeEach(() => {
  Object.defineProperty(global.window, "scrollTo", { value: spyScrollTo })
  Object.defineProperty(global.window, "scrollY", { value: 1 })

  spyScrollTo.mockClear()
})

describe(`TopButton`, () => {
  it("renders correctly", () => {
    const { container } = render(<TopButton />)

    expect(container).toBeInTheDocument()
  })

  it("scroll top", () => {
    const { getByTestId } = render(<TopButton />)

    fireEvent.click(getByTestId("top-button"))

    expect(getByTestId("top-button")).toBeInTheDocument()
  })
})
