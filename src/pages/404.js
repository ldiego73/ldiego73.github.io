import React from "react"

import { Layout } from "@layouts/main"
import { SEO } from "@components/seo"

import notFound from "../images/not-found.svg"

const title = "404: Not found"

const NotFoundPage = () => (
  <Layout>
    <SEO title={title} />
    <section className="not-found">
      <img src={notFound} alt={title} />
      <h1>This page doesn't exists</h1>
      <p>
        Sorry, the page was not found. You could have mistyped the URL, or the
        page has moved.
      </p>
    </section>
  </Layout>
)

export default NotFoundPage
