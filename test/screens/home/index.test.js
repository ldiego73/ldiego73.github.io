import "@mocks/console"

import { site, useStaticQuery } from "@mocks/gatsby"
import { Home } from "@screens/home/index"
import { render } from "@testing-library/react"
import * as React from "react"

useStaticQuery.mockImplementation(() => ({
  site,
}))

describe(`Home Screen`, () => {
  it("renders correctly", () => {
    const { container } = render(<Home />)

    expect(container).toBeInTheDocument()
  })
})
