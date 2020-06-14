import "./resume.scss"

import { Skills } from "@components/skills"
import { Timeline } from "@components/timeline"
import educations from "@data/educations.json"
import experiences from "@data/experiences.json"
import personalSkills from "@data/personal.skills.json"
import technicalSkills from "@data/technical.skills.json"
import React from "react"

const Resume = () => (
  <section id="resume" className="resume">
    <div className="container">
      <h3 className="resume__title">Resume</h3>
      <div className="resume__content">
        <div className="resume__experience">
          <h4 className="resume__subtitle">
            <em className="far fa-chart-bar" />
            EXPERIENCE
          </h4>
          <Timeline data={experiences} />
        </div>
        <div className="resume__education">
          <h4 className="resume__subtitle">
            <em className="fas fa-graduation-cap" />
            EDUCATION
          </h4>
          <Timeline data={educations} />
        </div>
      </div>
      <div className="resume__content">
        <div className="resume__skills">
          <h4 className="resume__subtitle">
            <em className="fas fa-layer-group" />
            TECHNICAL SKILLS
          </h4>
          <Skills data={technicalSkills} />
        </div>
        <div className="resume__skills">
          <h4 className="resume__subtitle">
            <em className="fas fa-user" />
            PERSONAL SKILLS
          </h4>
          <Skills data={personalSkills} />
        </div>
      </div>
    </div>
  </section>
)

export { Resume }
