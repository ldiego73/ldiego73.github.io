import { SEO } from "@components/seo"
import { useStaticQuery } from "@mocks/gatsby"
import { render } from "@testing-library/react"
import * as React from "react"
import { Helmet } from "react-helmet"

const site = {
  siteMetadata: {
    title: "Luis Diego",
  },
}

useStaticQuery.mockImplementation(() => ({
  site,
}))

describe(`SEO`, () => {
  it("renders correctly", () => {
    const siteTitle = "Home"

    render(<SEO title={siteTitle} />)
    const helmet = Helmet.peek()

    expect(helmet.title).toBe(`${siteTitle} | ${site.siteMetadata.title}`)
  })
})
