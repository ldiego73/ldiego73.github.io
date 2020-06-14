import { Timeline } from "@components/timeline"
import React from "react"

const ResumeTimeline = ({ title, icon, data }) => (
  <div className="resume__timeline">
    <h4 className="resume__subtitle">
      <em className={icon} />
      {title}
    </h4>
    <Timeline data={data} />
  </div>
)

export { ResumeTimeline }
