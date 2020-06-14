import React, { useState, useEffect } from "react"
import PropTypes from "prop-types"
import { Link } from "gatsby"

import "./header.scss"

const links = [
  {
    to: "/#about",
    title: "About",
  },
  {
    to: "/#resume",
    title: "Resume",
  },
  {
    to: "/#repos",
    title: "Repositories",
  },
  {
    to: "/#contact",
    title: "Contact",
  },
]

const Header = () => {
  const [opened, setOpen] = useState(false)

  const handleToogle = () => {
    setOpen(!opened)
  }

  const closeMenu = () => {
    setOpen(false)
  }

  /* istanbul ignore next */
  useEffect(() => {
    if (typeof window !== "undefined") {
      if (opened) {
        window.document.body.classList.add("no-scroll")
      } else {
        window.document.body.classList.remove("no-scroll")
      }
    }
  }, [opened])

  return (
    <header>
      <div className="header__inner">
        <Link to="/" aria-label="Home" className="header__logo">
          <span className="header__logo__mark">&gt;</span>
          <span className="header__logo__text">/home</span>
          <span className="header__logo__cursor"> </span>
        </Link>
        <div className="header__right">
          {links.map((l, i) => (
            <a
              key={`header-link-${i}`}
              href={l.to}
              className="header__link"
              arial-label={l.title}
            >
              {l.title}
            </a>
          ))}
          <a
            role="button"
            className={opened ? "header__menu is-active" : "header__menu"}
            aria-label="menu"
            aria-expanded="false"
            onClick={handleToogle}
            data-testid="header-menu"
          >
            <span aria-hidden="true"></span>
            <span aria-hidden="true"></span>
            <span aria-hidden="true"></span>
          </a>
        </div>
      </div>
      <div className={opened ? "header__mobile open" : "header__mobile"}>
        {links.map((l, i) => (
          <a
            key={`header-link-${i}`}
            href={l.to}
            className="header__link mobile"
            arial-label={l.title}
            onClick={closeMenu}
          >
            {l.title}
          </a>
        ))}
      </div>
    </header>
  )
}

Header.propTypes = {
  siteTitle: PropTypes.string,
}

Header.defaultProps = {
  siteTitle: ``,
}

export { Header }
