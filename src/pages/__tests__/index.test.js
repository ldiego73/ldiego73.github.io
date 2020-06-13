import * as React from "react"
import { Helmet } from "react-helmet"
import { render } from "@testing-library/react"

import Index from "../index"

import { useStaticQuery } from "../../../__mocks__/gatsby"

const site = {
  siteMetadata: {
    title: "Luis Diego",
  },
}

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
