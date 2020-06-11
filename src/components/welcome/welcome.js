import React from "react"

import { useHover } from "@hooks/use-hover"

import devBadge from "./images/dev-badge.svg"
import "./welcome.scss"

const tags = [
  "Microservices",
  "Microfrontends",
  "Serverless",
  "DevOps",
  "Full Stack",
  "Web",
  "Mobile",
]

const links = [
  {
    url: "https://github.com/ldiego73",
    name: "Github",
    icon: "fab fa-github",
  },
  {
    url: "https://pe.linkedin.com/in/ldiego73",
    name: "Linkedin",
    icon: "fab fa-linkedin",
  },
  {
    url: "https://twitter.com/ldiego73",
    name: "Twitter",
    icon: "fab fa-twitter",
  },
  {
    url: "https://www.instagram.com/ldiego73",
    name: "Instagram",
    icon: "fab fa-instagram",
  },
  {
    url: "mailto:lfdiego7@gmail.com",
    name: "Email",
    icon: "far fa-envelope",
  },
]

const Welcome = () => {
  const [hoverRef, isHovered] = useHover()

  return (
    <section className="welcome">
      <h1 className="welcome__hello">
        Hello!, I'm Luis Diego{" "}
        <span
          ref={hoverRef}
          className={`emoji wave-hand animated ${isHovered ? "wave" : ""}`}
        ></span>
      </h1>
      <h2 className="welcome__bio">
        I'm a <span className="name">Solutions Architect</span> with extensive
        experience in digital transformation projects, enterprise architecture
        and application development.&nbsp;
        <span className="emoji technologist"></span>
      </h2>
      <div className="welcome__tags">
        {tags.map(t => (
          <span key={t} className="tag">
            {t}
          </span>
        ))}
      </div>
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
          <li>
            <a
              href="https://dev.to/ldiego73"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Dev.to"
            >
              <img
                className="devto"
                src={devBadge}
                alt="Luis Diego"
                height="48"
                width="48"
              />
            </a>
          </li>
        </ul>
      </div>
    </section>
  )
}

export { Welcome }
