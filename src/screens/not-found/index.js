import { SEO } from "@components/seo"
import { Layout } from "@layouts/main"
import React from "react"

import notFound from "../../images/not-found.svg"

const NotFound = () => {
  const title = "Not found"

  return (
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
}

export { NotFound }
