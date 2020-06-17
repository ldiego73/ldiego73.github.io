import { About } from "@screens/home/components/about"
import { render } from "@testing-library/react"
import * as React from "react"

describe(`About`, () => {
  it("renders correctly", () => {
    const { container } = render(<About />)

    expect(container).toBeInTheDocument()
  })
})
