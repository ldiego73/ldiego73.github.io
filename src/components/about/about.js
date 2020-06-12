import React from "react"

import profile from "../../images/profile.jpeg"

import "./about.scss"

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
        <p>
          I'm an engineer passionate about technologies, the development of
          fantastic applications whether they are websites, mobile applications
          or anything else. <br />
          My goal is to always build applications that are scalable, secure, and
          reliable, offering an excellent user experience.
          <br />
          In my free time I like to travel and get to know new places, cultures
          and people. Backpacker at heart, good music and adventure.
        </p>
        <a
          href={resumeLink}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Resume"
          className="button"
        >
          Download CV
        </a>
      </div>
    </div>
  </section>
)

export { About }
