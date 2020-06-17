import "@mocks/console"

import { site, useStaticQuery } from "@mocks/gatsby"
import { NotFound } from "@screens/not-found/index"
import { render } from "@testing-library/react"
import * as React from "react"

useStaticQuery.mockImplementation(() => ({
  site,
}))

describe(`Not Found Screen`, () => {
  it("renders correctly", () => {
    const { container } = render(<NotFound />)

    expect(container).toBeInTheDocument()
  })
})
