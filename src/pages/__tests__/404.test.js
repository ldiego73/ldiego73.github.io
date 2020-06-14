import { render } from "@testing-library/react"
import * as React from "react"
import { Helmet } from "react-helmet"

import { useStaticQuery } from "../../../__mocks__/gatsby"
import NotFound from "../404"

const site = {
  siteMetadata: {
    title: "Luis Diego",
  },
}

useStaticQuery.mockImplementation(() => ({
  site,
}))

describe(`Not Found`, () => {
  it("renders correctly", () => {
    const { container } = render(<NotFound />)

    const helmet = Helmet.peek()

    expect(container).toBeInTheDocument()
    expect(helmet.title).toBe(`Not found | ${site.siteMetadata.title}`)
  })
})
