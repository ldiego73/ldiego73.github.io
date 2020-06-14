import { render } from "@testing-library/react"
import * as React from "react"

import { Timeline } from "../timeline"

const data = [
  {
    year: new Date().getFullYear(),
    title: "Timeline title",
    subtitle: "Timeline subtitle",
  },
]

describe(`Repository`, () => {
  it("renders correctly", () => {
    const { container } = render(<Timeline data={data} />)

    expect(container).toBeInTheDocument()
  })
})
