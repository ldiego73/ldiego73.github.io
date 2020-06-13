import * as React from "react"
import { render } from "@testing-library/react"

import { About } from "../about"

describe(`About`, () => {
  it("renders correctly", () => {
    const { container } = render(<About />)

    expect(container).toBeInTheDocument()
  })
})
