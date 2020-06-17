import { Resume } from "@screens/home/components/resume"
import { render } from "@testing-library/react"
import * as React from "react"

describe(`Resume`, () => {
  it("renders correctly", () => {
    const { container } = render(<Resume />)

    expect(container).toBeInTheDocument()
  })
})
