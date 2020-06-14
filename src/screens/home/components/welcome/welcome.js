import React from "react"

import { useHover } from "@hooks/use-hover"

import "./welcome.scss"
import links from "@data/links.json"

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
        ></span>
      </h1>
      <h2 className="welcome__bio">
        I'm a <span className="name">Solutions Architect</span> with extensive
        experience in digital transformation projects, enterprise architecture
        and application development.&nbsp;
        <span className="emoji technologist"></span>
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
                <em className={l.icon}></em>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export { Welcome }
