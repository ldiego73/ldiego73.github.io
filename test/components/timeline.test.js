import { Timeline } from "@components/timeline"
import { render } from "@testing-library/react"
import * as React from "react"

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
