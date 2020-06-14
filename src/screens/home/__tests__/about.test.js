import { render } from "@testing-library/react"
import * as React from "react"

import { About } from "../components/about"

describe(`About`, () => {
  it("renders correctly", () => {
    const { container } = render(<About />)

    expect(container).toBeInTheDocument()
  })
})
