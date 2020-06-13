import * as React from "react"
import { render } from "@testing-library/react"
import { Helmet } from "react-helmet"

import { PureSEO } from "../seo"

describe(`SEO`, () => {
  it("renders correctly", () => {
    const site = {
      siteMetadata: {
        title: "Luis Diego",
      },
    }
    const siteTitle = "Home"

    render(<PureSEO site={site} title={siteTitle} />)
    const helmet = Helmet.peek()

    expect(helmet.title).toBe(`${siteTitle} | ${site.siteMetadata.title}`)
  })
})
