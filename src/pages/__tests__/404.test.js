import * as React from "react"
import { Helmet } from "react-helmet"
import { render } from "@testing-library/react"

import NotFound from "../404"

import { useStaticQuery } from "../../../__mocks__/gatsby"

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
