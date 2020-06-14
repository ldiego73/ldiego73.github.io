import "./footer.scss"

import links from "@data/links.json"
import React from "react"

const Footer = () => (
  <footer>
    <div className="container">
      <div className="footer__copyright">
        Copyright ©{new Date().getFullYear()} All rights reserved
      </div>
      <div className="footer__links">
        <ul>
          {links.map(l => (
            <li key={l.name}>
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={l.name}
              >
                <em className={l.icon} />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  </footer>
)

export { Footer }
