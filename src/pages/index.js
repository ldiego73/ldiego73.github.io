import React from "react"

import { Layout } from "@layouts/main"
import { Welcome } from "@components/welcome"
import { About } from "@components/about"
import { SEO } from "@components/seo"

const IndexPage = () => (
  <Layout>
    <SEO title="Home" />
    <Welcome />
    <About />
  </Layout>
)

export default IndexPage
