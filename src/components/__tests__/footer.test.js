import * as React from "react"
import { render } from "@testing-library/react"

import { Footer } from "../footer"

describe(`Footer`, () => {
  it("renders correctly", () => {
    const { container } = render(<Footer />)

    expect(container).toBeInTheDocument()
  })
})
