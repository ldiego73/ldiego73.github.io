import "@styles/theme.scss"

import { Footer } from "@components/footer"
import { Header } from "@components/header"
import { TopButton } from "@components/top-button"
import PropTypes from "prop-types"
import React from "react"

const Layout = ({ children }) => {
  return (
    <>
      <Header />
      <main>{children}</main>
      <Footer />
      <TopButton />
    </>
  )
}

Layout.propTypes = {
  children: PropTypes.node.isRequired,
}

export { Layout }
