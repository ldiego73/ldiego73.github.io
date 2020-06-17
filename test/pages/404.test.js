import "@mocks/console"

import { site, useStaticQuery } from "@mocks/gatsby"
import NotFound from "@pages/404"
import { render } from "@testing-library/react"
import * as React from "react"
import { Helmet } from "react-helmet"

useStaticQuery.mockImplementation(() => ({
  site,
}))

describe(`Not Found`, () => {
  it("renders correctly", () => {
    const { container } = render(<NotFound />)

    const helmet = Helmet.peek()

    expect(container).toBeInTheDocument()
    expect(helmet.title).toBe(
      `not-found.siteTitle | ${site.siteMetadata.title}`
    )
  })
})
