import { Repository } from "@components/repository"
import { render } from "@testing-library/react"
import * as React from "react"

describe(`Repository`, () => {
  it("renders correctly", () => {
    const { container } = render(
      <Repository
        name="Repo test"
        url="https://github.com/"
        language="JavaScript"
        starts={3}
        forks={3}
        size={100}
      />
    )

    expect(container).toBeInTheDocument()
  })
})
