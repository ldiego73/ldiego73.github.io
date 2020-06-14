import { render } from "@testing-library/react"
import * as React from "react"

import { Skills } from "../skills"

const data = [{ name: "Frontend", percentage: 1 }]

describe(`Repository`, () => {
  it("renders correctly", () => {
    const { container } = render(<Skills data={data} />)

    expect(container).toBeInTheDocument()
  })
})
