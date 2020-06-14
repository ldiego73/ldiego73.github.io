import "./welcome.scss"

import links from "@data/links.json"
import { useHover } from "@hooks/use-hover"
import React from "react"

const Welcome = () => {
  const [hoverRef, isHovered] = useHover()

  return (
    <section className="welcome">
      <h1 className="welcome__hello">
        Hello!, I'm Luis Diego{" "}
        <span
          ref={hoverRef}
          data-testid="welcome-wave"
          className={`emoji wave-hand animated ${isHovered ? "wave" : ""}`}
        />
      </h1>
      <h2 className="welcome__bio">
        I'm a <span className="name">Solutions Architect</span> with extensive
        experience in digital transformation projects, enterprise architecture
        and application development.&nbsp;
        <span className="emoji technologist" />
      </h2>
      <div className="welcome__social">
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
    </section>
  )
}

export { Welcome }
