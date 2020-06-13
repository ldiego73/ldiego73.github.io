import * as React from "react"
import { render } from "@testing-library/react"

import { Resume } from "../resume"

describe(`Resume`, () => {
  it("renders correctly", () => {
    const { container } = render(<Resume />)

    expect(container).toBeInTheDocument()
  })
})
