import { Footer } from "@components/footer"
import { render } from "@testing-library/react"
import * as React from "react"

describe(`Footer`, () => {
  it("renders correctly", () => {
    const { container } = render(<Footer />)

    expect(container).toBeInTheDocument()
  })
})
