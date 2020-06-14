/* eslint-disable react/no-danger */

import "./about.scss"

import data from "@data/home.json"
import React from "react"

import profile from "../../../../images/profile.jpeg"

const resumeLink =
  "https://docs.google.com/document/d/17UguL4pk7N8iv3PJltWHz7reYeM2xXoaMyR1x3cWg40/edit?usp=sharing"

const About = () => (
  <section id="about" className="about">
    <div className="container">
      <div className="about__profile">
        <img src={profile} alt="Luis Diego" />
      </div>
      <div className="about__details">
        <h3>ABOUT ME</h3>
        <p dangerouslySetInnerHTML={{ __html: data.about.me }} />
        <a
          href={resumeLink}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Resume"
          className="button"
        >
          {data.about.download}
        </a>
      </div>
    </div>
  </section>
)

export { About }
