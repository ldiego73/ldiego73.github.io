import React from "react"

import { Layout } from "@layouts/main"
import { Welcome } from "@components/welcome"
import { SEO } from "@components/seo"

const IndexPage = () => (
  <Layout>
    <SEO title="Home" />
    <Welcome />
  </Layout>
)

export default IndexPage
