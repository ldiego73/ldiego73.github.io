import React from "react"
import PropTypes from "prop-types"
import { Link } from "gatsby"

import "./header.scss"

const links = [
  {
    to: "#about",
    title: "About",
  },
  {
    to: "#resume",
    title: "Resume",
  },
  {
    to: "#repos",
    title: "Repositories",
  },
  {
    to: "#contact",
    title: "Contact",
  },
]

const Header = ({ siteTitle }) => (
  <header>
    <div className="header__inner">
      <Link to="/" aria-label="Home" className="header__logo">
        <span className="header__logo__mark">&gt;</span>
        <span className="header__logo__text">/home</span>
        <span className="header__logo__cursor"> </span>
      </Link>
      <div className="header__right">
        {links.map((l, i) => (
          <Link
            key={`header-link-${i}`}
            to={l.to}
            className="header__link"
            arial-label={l.title}
          >
            {l.title}
          </Link>
        ))}
      </div>
    </div>
  </header>
)

Header.propTypes = {
  siteTitle: PropTypes.string,
}

Header.defaultProps = {
  siteTitle: ``,
}

export { Header }
