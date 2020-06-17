import "@mocks/console"

import { site, useStaticQuery } from "@mocks/gatsby"
import Index from "@pages/index"
import { render } from "@testing-library/react"
import * as React from "react"
import { Helmet } from "react-helmet"

useStaticQuery.mockImplementation(() => ({
  site,
}))

describe(`Index`, () => {
  it("renders correctly", () => {
    const { container } = render(<Index />)

    const helmet = Helmet.peek()

    expect(container).toBeInTheDocument()
    expect(helmet.title).toBe(`Home | ${site.siteMetadata.title}`)
  })
})
