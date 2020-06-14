import "./timeline.scss"

import PropTypes from "prop-types"
import React from "react"

import { TimelineItem } from "./timeline-item"

const Timeline = ({ data, children }) => (
  <ul className="timeline">
    {data.map((row, i) => (
      <TimelineItem
        key={`timeline-${i}`}
        year={row.year}
        title={row.title}
        subtitle={row.subtitle}
        details={row.details}
      />
    ))}
    {children}
  </ul>
)

Timeline.defaultProps = {
  data: [],
}

Timeline.propTypes = {
  data: PropTypes.arrayOf(
    PropTypes.shape({
      year: PropTypes.number.isRequired,
      title: PropTypes.string.isRequired,
      subtitle: PropTypes.string.isRequired,
      details: PropTypes.arrayOf(PropTypes.string),
    })
  ),
}

export { Timeline }
