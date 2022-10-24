import { SEO } from "@components/seo"
import { Layout } from "@layouts/main"
import React from "react"

import { About } from "./components/about"
import { Contact } from "./components/contact"
import { Repos } from "./components/repos"
import { Resume } from "./components/resume"
import { Welcome } from "./components/welcome"

function Home() {
  return <Layout>
    <SEO title="Home" />
    <Welcome />
    <About />
    <Resume />
    <Repos />
    <Contact />
  </Layout>
}

export { Home }
