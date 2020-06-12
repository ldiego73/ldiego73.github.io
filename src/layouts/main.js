import React from "react"
import PropTypes from "prop-types"

import { Header } from "@components/header"
import { Footer } from "@components/footer"
import { TopButton } from "@components/top-button"
import "@styles/theme.scss"

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
