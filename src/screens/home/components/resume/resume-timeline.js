import { Timeline } from "@components/timeline"
import React from "react"

function ResumeTimeline({ title, icon, data }) {
  return <div className="resume__timeline">
    <h4 className="resume__subtitle">
      <em className={icon} />
      {title}
    </h4>
    <Timeline data={data} />
  </div>
}

export { ResumeTimeline }
