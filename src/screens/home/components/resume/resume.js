import "./resume.scss"

import educations from "@data/educations.json"
import experiences from "@data/experiences.json"
import personalSkills from "@data/personal.skills.json"
import technicalSkills from "@data/technical.skills.json"
import React from "react"

import { ResumeSkills } from "./resume-skills"
import { ResumeTimeline } from "./resume-timeline"

const Resume = () => (
  <section id="resume" className="resume">
    <div className="container">
      <h3 className="resume__title">Resume</h3>
      <div className="resume__content">
        <ResumeTimeline
          title="EXPERIENCE"
          icon="far fa-chart-bar"
          data={experiences}
        />
        <ResumeTimeline
          title="EDUCATION"
          icon="fas fa-graduation-cap"
          data={educations}
        />
      </div>
      <div className="resume__content">
        <ResumeSkills
          title="TECHNICAL SKILLS"
          icon="fas fa-layer-group"
          data={technicalSkills}
        />
        <ResumeSkills
          title="PERSONAL SKILLS"
          icon="fas fa-user"
          data={personalSkills}
        />
      </div>
    </div>
  </section>
)

export { Resume }
