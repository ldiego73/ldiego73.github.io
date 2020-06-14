import React from "react"

import { Layout } from "@layouts/main"
import { SEO } from "@components/seo"
import { Welcome } from "./components/welcome"
import { About } from "./components/about"
import { Resume } from "./components/resume"
import { Repos } from "./components/repos"
import { Contact } from "./components/contact"

const Home = () => (
  <Layout>
    <SEO title="Home" />
    <Welcome />
    <About />
    <Resume />
    <Repos />
    <Contact />
  </Layout>
)

export { Home }
