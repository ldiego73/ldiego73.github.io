import React from "react"

import { Layout } from "@layouts/main"
import { Welcome } from "@components/welcome"
import { About } from "@components/about"
import { Resume } from "@components/resume"
import { Repos } from "@components/repos"
import { Contact } from "@components/contact"
import { SEO } from "@components/seo"

const IndexPage = () => (
  <Layout>
    <SEO title="Home" />
    <Welcome />
    <About />
    <Resume />
    <Repos />
    <Contact />
  </Layout>
)

export default IndexPage
